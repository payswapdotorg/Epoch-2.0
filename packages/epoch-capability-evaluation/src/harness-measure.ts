// Harness vocabulary, measurement collection and versioned digests.
// Split from harness.ts to honor the max-file-lines law; public surface is
// unchanged (src/index.ts re-exports). Pure and deterministic.

import type {
  BenchmarkResult,
  CapabilityUnderTest,
  MetricMeasurement,
  ReferenceRun,
} from "./contract.js";
import { digestOf, isSha256Digest } from "./digest.js";

export type HarnessErrorCode =
  | "harness/descriptor-invalid"
  | "harness/class-mismatch"
  | "harness/invalid-capability-declaration"
  | "harness/invalid-reference-run"
  | "harness/reference-benchmark-mismatch"
  | "harness/measurement-metric-not-selected"
  | "harness/duplicate-measurement"
  | "harness/invalid-measurement"
  | "harness/invalid-evidence"
  | "harness/invalid-known-limit"
  | "harness/missing-measurement"
  | "harness/missing-reference-measurement";

export type HarnessError = {
  readonly code: HarnessErrorCode;
  readonly detail: string;
};

export type HarnessOutcome =
  | { readonly ok: true; readonly result: BenchmarkResult }
  | { readonly ok: false; readonly error: HarnessError };

type CollectResult =
  | { ok: true; map: Map<string, MetricMeasurement> }
  | { ok: false; error: HarnessError };

export function collectMeasurements(
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
        error: {
          code: "harness/duplicate-measurement",
          detail: `${label} declares metric ${measurement.metricId} more than once`,
        },
      };
    }
    if (
      !Number.isFinite(measurement.value) ||
      !Number.isInteger(measurement.samples) ||
      measurement.samples < 1
    ) {
      return {
        ok: false,
        error: {
          code: "harness/invalid-measurement",
          detail: `${label} measurement for ${measurement.metricId} has a non-finite value or a sample count below 1`,
        },
      };
    }
    if (
      measurement.evidenceDigest !== undefined &&
      !isSha256Digest(measurement.evidenceDigest)
    ) {
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
