// Differential conformance harness — pure and deterministic.
// Reads declarations only (no execution authority); no wall clock, no randomness.
// Identical inputs produce byte-identical results, sealed by resultDigest.
// There is deliberately NO cross-metric composite score: mixing units would be a
// misleading universal score; per-metric outcomes and counts are reported instead.
// Vocabulary, measurement collection and digests live in harness-measure.ts;
// decision synthesis lives in harness-decision.ts.

import type {
  BenchmarkDescriptor,
  CapabilityUnderTest,
  DifferentialVerdict,
  HardConstraint,
  MetricOutcome,
  ReferenceRun,
} from "./contract.js";
import { digestOf, isSha256Digest } from "./digest.js";
import { lookupMetricDescriptor } from "./catalog.js";
import { validateBenchmarkDescriptor } from "./descriptor.js";
import { validateKnownLimits } from "./limits.js";
import {
  capabilityDigestOf,
  collectMeasurements,
  referenceDigestOf,
  type HarnessError,
  type HarnessOutcome,
} from "./harness-measure.js";
import { decide } from "./harness-decision.js";

function err(code: HarnessError["code"], detail: string): HarnessOutcome {
  return { ok: false, error: { code, detail } };
}

export function runBenchmark(
  descriptor: BenchmarkDescriptor,
  capabilityUnderTest: CapabilityUnderTest,
  referenceRun: ReferenceRun,
): HarnessOutcome {
  const descriptorCheck = validateBenchmarkDescriptor(descriptor);
  if (!descriptorCheck.ok) {
    return err("harness/descriptor-invalid", `${descriptorCheck.rejection.code}: ${descriptorCheck.rejection.detail}`);
  }
  if (capabilityUnderTest.kind !== "capability-under-test") {
    return err("harness/invalid-capability-declaration", 'capability under test must declare kind "capability-under-test"');
  }
  if (
    typeof capabilityUnderTest.capabilityId !== "string" ||
    capabilityUnderTest.capabilityId.trim() === "" ||
    typeof capabilityUnderTest.version !== "string" ||
    capabilityUnderTest.version.trim() === ""
  ) {
    return err("harness/invalid-capability-declaration", "capability id/version must be non-empty strings");
  }
  if (capabilityUnderTest.capabilityClass !== descriptor.capabilityClass) {
    return err(
      "harness/class-mismatch",
      `capability class ${capabilityUnderTest.capabilityClass} does not match benchmark class ${descriptor.capabilityClass}`,
    );
  }
  if (referenceRun.kind !== "reference-run") {
    return err("harness/invalid-reference-run", 'reference run must declare kind "reference-run"');
  }
  if (
    typeof referenceRun.referenceId !== "string" ||
    referenceRun.referenceId.trim() === "" ||
    typeof referenceRun.referenceVersion !== "string" ||
    referenceRun.referenceVersion.trim() === ""
  ) {
    return err("harness/invalid-reference-run", "reference id/version must be non-empty strings");
  }
  if (referenceRun.benchmarkId !== descriptor.id || referenceRun.benchmarkVersion !== descriptor.version) {
    return err(
      "harness/reference-benchmark-mismatch",
      `reference run targets benchmark ${referenceRun.benchmarkId}@${referenceRun.benchmarkVersion}, expected ${descriptor.id}@${descriptor.version}`,
    );
  }
  for (const evidence of capabilityUnderTest.evidence) {
    if (!isSha256Digest(evidence.digest)) {
      return err("harness/invalid-evidence", "evidence reference digest is malformed");
    }
  }
  const limitRejection = validateKnownLimits(capabilityUnderTest.knownLimits);
  if (limitRejection !== null) {
    return err("harness/invalid-known-limit", limitRejection.detail);
  }
  const selectedIds = new Set<string>(descriptor.metricSelections.map((selection) => selection.metricId));
  const cutMeasurements = collectMeasurements("capability-under-test", capabilityUnderTest.measurements, selectedIds);
  if (!cutMeasurements.ok) {
    return { ok: false, error: cutMeasurements.error };
  }
  const referenceMeasurements = collectMeasurements("reference-run", referenceRun.measurements, selectedIds);
  if (!referenceMeasurements.ok) {
    return { ok: false, error: referenceMeasurements.error };
  }
  const cutMap = cutMeasurements.map;
  const refMap = referenceMeasurements.map;
  const hardByMetric = new Map<string, HardConstraint>();
  for (const constraint of descriptor.hardConstraints) {
    hardByMetric.set(constraint.metricId, constraint);
  }
  for (const selection of descriptor.metricSelections) {
    const requiresCut =
      selection.qualificationThreshold !== undefined ||
      selection.differential !== undefined ||
      hardByMetric.has(selection.metricId);
    if (requiresCut && !cutMap.has(selection.metricId)) {
      return err("harness/missing-measurement", `benchmark requires a measurement for ${selection.metricId}`);
    }
    if (selection.differential !== undefined && !refMap.has(selection.metricId)) {
      return err("harness/missing-reference-measurement", `differential metric ${selection.metricId} lacks a reference measurement`);
    }
  }
  const outcomes: MetricOutcome[] = [];
  for (const selection of descriptor.metricSelections) {
    const metric = lookupMetricDescriptor(selection.metricId);
    if (metric === null) {
      return err("harness/descriptor-invalid", `metric ${selection.metricId} is not in the catalog`);
    }
    const cutMeasurement = cutMap.get(selection.metricId) ?? null;
    const refMeasurement = refMap.get(selection.metricId) ?? null;
    const hardConstraint = hardByMetric.get(selection.metricId) ?? null;
    const cutValue = cutMeasurement !== null ? cutMeasurement.value : null;
    const referenceValue = refMeasurement !== null ? refMeasurement.value : null;
    const hardConstraintViolated =
      hardConstraint !== null &&
      cutValue !== null &&
      (hardConstraint.kind === "minimum" ? cutValue < hardConstraint.value : cutValue > hardConstraint.value);
    const thresholdMet =
      selection.qualificationThreshold !== undefined && cutValue !== null
        ? metric.direction === "higher-is-better"
          ? cutValue >= selection.qualificationThreshold
          : cutValue <= selection.qualificationThreshold
        : null;
    let differential: DifferentialVerdict | null = null;
    let improvement: number | null = null;
    if (selection.differential !== undefined && cutValue !== null && referenceValue !== null) {
      improvement = metric.direction === "higher-is-better" ? cutValue - referenceValue : referenceValue - cutValue;
      differential =
        improvement >= selection.differential.superiorityMargin
          ? "superior"
          : improvement >= -selection.differential.comparableTolerance
            ? "comparable"
            : "inferior";
    }
    const verdict =
      hardConstraintViolated ? "fail" : thresholdMet === false ? "fail" : thresholdMet === true ? "pass" : "not-evaluated";
    outcomes.push({
      metricId: selection.metricId,
      family: metric.family,
      cutValue,
      referenceValue,
      hardConstraint,
      hardConstraintViolated,
      thresholdMet,
      differential,
      improvement,
      evidenceDigest: cutMeasurement !== null ? (cutMeasurement.evidenceDigest ?? null) : null,
      verdict,
    });
  }
  const decision = decide(descriptor, capabilityUnderTest, outcomes);
  const outcomeCounts = {
    passed: outcomes.filter((outcome) => outcome.verdict === "pass").length,
    failed: outcomes.filter((outcome) => outcome.verdict === "fail").length,
    notEvaluated: outcomes.filter((outcome) => outcome.verdict === "not-evaluated").length,
  };
  const unsealed = {
    kind: "benchmark-result" as const,
    benchmarkId: descriptor.id,
    benchmarkVersion: descriptor.version,
    descriptorDigest: descriptorCheck.descriptorDigest,
    corpusDigest: descriptor.corpus.corpusDigest,
    capabilityDigest: capabilityDigestOf(capabilityUnderTest),
    referenceDigest: referenceDigestOf(referenceRun),
    metricOutcomes: outcomes,
    outcomeCounts,
    decision,
    knownLimits: capabilityUnderTest.knownLimits,
  };
  return { ok: true, result: { ...unsealed, resultDigest: digestOf(unsealed) } };
}
