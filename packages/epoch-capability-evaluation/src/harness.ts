// Differential conformance harness — pure and deterministic.
// Reads declarations only (no execution authority); no wall clock, no randomness.
// Identical inputs produce byte-identical results, sealed by resultDigest.
// There is deliberately NO cross-metric composite score: mixing units would be a
// misleading universal score; per-metric outcomes and counts are reported instead.

import type {
  BenchmarkDescriptor,
  BenchmarkResult,
  CapabilityUnderTest,
  DifferentialVerdict,
  HardConstraint,
  HarnessError,
  HarnessOutcome,
  MetricMeasurement,
  MetricOutcome,
  QualificationDecision,
  ReferenceRun,
} from "./contract.js";
import { digestOf, isSha256Digest } from "./digest.js";
import { lookupMetricDescriptor } from "./catalog.js";
import { validateBenchmarkDescriptor } from "./descriptor.js";
import { validateKnownLimits } from "./limits.js";
import { rankOf, stepDown } from "./qualification.js";

function err(code: HarnessError["code"], detail: string): HarnessOutcome {
  return { ok: false, error: { code, detail } };
}

type CollectResult =
  | { ok: true; map: Map<string, MetricMeasurement> }
  | { ok: false; error: HarnessError };

function collectMeasurements(
  label: string,
  measurements: readonly MetricMeasurement[],
  selectedIds: ReadonlySet<string>,
): CollectResult {
  const map = new Map<string, MetricMeasurement>();
  for (const measurement of measurements) {
    if (!selectedIds.has(measurement.metricId)) {
      return {
        ok: false,
        error: {
          code: "harness/measurement-metric-not-selected",
          detail: `${label} declares metric ${measurement.metricId} which the benchmark does not select`,
        },
      };
    }
    if (map.has(measurement.metricId)) {
      return {
        ok: false,
        error: { code: "harness/duplicate-measurement", detail: `${label} declares metric ${measurement.metricId} more than once` },
      };
    }
    if (!Number.isFinite(measurement.value) || !Number.isInteger(measurement.samples) || measurement.samples < 1) {
      return {
        ok: false,
        error: {
          code: "harness/invalid-measurement",
          detail: `${label} measurement for ${measurement.metricId} has a non-finite value or a sample count below 1`,
        },
      };
    }
    if (measurement.evidenceDigest !== undefined && !isSha256Digest(measurement.evidenceDigest)) {
      return {
        ok: false,
        error: {
          code: "harness/invalid-measurement",
          detail: `${label} measurement for ${measurement.metricId} carries a malformed evidence digest`,
        },
      };
    }
    map.set(measurement.metricId, measurement);
  }
  return { ok: true, map };
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
      selection.qualificationThreshold !== undefined || selection.differential !== undefined || hardByMetric.has(selection.metricId);
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

function decide(
  descriptor: BenchmarkDescriptor,
  cut: CapabilityUnderTest,
  outcomes: readonly MetricOutcome[],
): QualificationDecision {
  const policy = descriptor.qualificationPolicy;
  const hardConstraintViolations = outcomes.filter((outcome) => outcome.hardConstraintViolated).map((outcome) => outcome.metricId);
  const failedMetricIds = outcomes.filter((outcome) => outcome.verdict === "fail").map((outcome) => outcome.metricId);
  const passing = outcomes.filter((outcome) => outcome.verdict === "pass");
  const differentialOutcomes = outcomes.filter((outcome) => outcome.differential !== null);
  const anyInferior = differentialOutcomes.some((outcome) => outcome.differential === "inferior");
  const allSuperior = differentialOutcomes.length > 0 && differentialOutcomes.every((outcome) => outcome.differential === "superior");
  const allComparableOrBetter =
    differentialOutcomes.length > 0 &&
    differentialOutcomes.every((outcome) => outcome.differential === "superior" || outcome.differential === "comparable");
  const enoughDifferential = differentialOutcomes.length >= policy.minDifferentialMetrics;
  const evidenceSufficient =
    passing.length >= policy.minQualifiedMetrics && (!policy.evidenceRequired || passing.every((outcome) => outcome.evidenceDigest !== null));
  const rationale: string[] = [];
  let to = cut.currentStatus;
  if (failedMetricIds.length > 0 || anyInferior) {
    to = stepDown(cut.currentStatus);
    if (failedMetricIds.length > 0) {
      rationale.push(`failed-metrics:${failedMetricIds.join(",")}`);
    }
    if (hardConstraintViolations.length > 0) {
      rationale.push(`hard-constraint-violations:${hardConstraintViolations.join(",")}`);
    }
    if (anyInferior) {
      rationale.push("differential-inferior-on-at-least-one-metric");
    }
    rationale.push("regression-event:one-rung-demotion");
  } else if (!evidenceSufficient) {
    rationale.push(`insufficient-evidence:passing=${passing.length},required=${policy.minQualifiedMetrics}`);
  } else if (cut.currentStatus === "prototype") {
    to = "named-task-qualified";
    rationale.push("named-task-qualification:thresholds-and-evidence-satisfied");
  } else if (cut.currentStatus === "named-task-qualified") {
    if (enoughDifferential && allComparableOrBetter) {
      to = "reference-comparable";
      rationale.push("reference-comparability:differential-band-satisfied");
    } else {
      rationale.push("hold:differential-evidence-insufficient");
    }
  } else if (cut.currentStatus === "reference-comparable") {
    if (enoughDifferential && allSuperior) {
      to = "reference-superior";
      rationale.push("reference-superiority:all-differential-metrics-superior");
    } else {
      rationale.push("hold:superiority-not-established");
    }
  } else {
    rationale.push("hold:already-at-top-rung");
  }
  const direction =
    rankOf(to) > rankOf(cut.currentStatus) ? "promotion" : rankOf(to) < rankOf(cut.currentStatus) ? "regression" : "hold";
  const qualifiedForRelease =
    hardConstraintViolations.length === 0 && failedMetricIds.length === 0 && rankOf(to) >= rankOf("named-task-qualified");
  const evidenceRefs = [
    ...new Set([
      ...cut.evidence.map((evidence) => evidence.digest),
      ...outcomes.map((outcome) => outcome.evidenceDigest).filter((digest): digest is string => digest !== null),
    ]),
  ].sort();
  return {
    from: cut.currentStatus,
    to,
    direction,
    qualifiedForRelease,
    hardConstraintViolations,
    failedMetricIds,
    evidenceRefs,
    rationale,
  };
}

/** Versioned capability digest: identity, version, measurements, evidence and limits (status excluded). */
export function capabilityDigestOf(cut: CapabilityUnderTest): string {
  return digestOf({
    kind: "capability-declaration",
    capabilityId: cut.capabilityId,
    capabilityClass: cut.capabilityClass,
    version: cut.version,
    measurements: cut.measurements,
    evidence: cut.evidence,
    knownLimits: cut.knownLimits,
  });
}

/** Versioned digest of the reference run declaration. */
export function referenceDigestOf(referenceRun: ReferenceRun): string {
  return digestOf(referenceRun);
}

/** Recomputes the sealed digest of a benchmark result. */
export function verifyResultDigest(result: BenchmarkResult): boolean {
  const { resultDigest, ...unsealed } = result;
  return isSha256Digest(resultDigest) && resultDigest === digestOf(unsealed);
}
