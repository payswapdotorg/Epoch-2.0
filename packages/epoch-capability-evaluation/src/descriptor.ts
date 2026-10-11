// Benchmark descriptor validation (descriptors are data, not behavior).
// The descriptor rejection vocabulary lives here, beside its validator, and is
// re-exported by src/index.ts.

import type { BenchmarkDescriptor } from "./contract.js";
import { digestOf, isSha256Digest } from "./digest.js";
import { lookupMetricDescriptor, metricIdsForClass } from "./catalog.js";

export type DescriptorRejectionCode =
  | "descriptor/invalid-identity"
  | "descriptor/unknown-capability-class"
  | "descriptor/corpus-ref-malformed"
  | "descriptor/no-metrics"
  | "descriptor/metric-not-selected-for-class"
  | "descriptor/duplicate-metric"
  | "descriptor/invalid-weight"
  | "descriptor/invalid-threshold"
  | "descriptor/invalid-differential-band"
  | "descriptor/hard-constraint-unknown-metric"
  | "descriptor/duplicate-hard-constraint"
  | "descriptor/invalid-hard-constraint"
  | "descriptor/invalid-qualification-policy";

export type DescriptorRejection = {
  readonly code: DescriptorRejectionCode;
  readonly detail: string;
};

export type DescriptorValidation =
  | { readonly ok: true; readonly descriptorDigest: string }
  | { readonly ok: false; readonly rejection: DescriptorRejection };

const RATIO_UNIT = "ratio";

function reject(code: DescriptorRejectionCode, detail: string): DescriptorValidation {
  return { ok: false, rejection: { code, detail } };
}

function inRatioRange(value: number): boolean {
  return value >= 0 && value <= 1;
}

export function validateBenchmarkDescriptor(descriptor: BenchmarkDescriptor): DescriptorValidation {
  if (
    typeof descriptor.id !== "string" ||
    descriptor.id.trim() === "" ||
    !Number.isInteger(descriptor.version) ||
    descriptor.version < 1
  ) {
    return reject("descriptor/invalid-identity", "descriptor id must be non-empty and version a positive integer");
  }
  const classMetricIds = metricIdsForClass(descriptor.capabilityClass);
  if (classMetricIds === null) {
    return reject(
      "descriptor/unknown-capability-class",
      `capability class ${descriptor.capabilityClass} is not in the frozen registry`,
    );
  }
  const corpus = descriptor.corpus;
  if (
    typeof corpus.corpusId !== "string" ||
    corpus.corpusId.trim() === "" ||
    !Number.isInteger(corpus.corpusVersion) ||
    corpus.corpusVersion < 1 ||
    !isSha256Digest(corpus.corpusDigest)
  ) {
    return reject(
      "descriptor/corpus-ref-malformed",
      "corpus reference needs a non-empty id, a positive version and a sha256 digest",
    );
  }
  const selections = descriptor.metricSelections;
  if (selections.length === 0) {
    return reject("descriptor/no-metrics", "descriptor selects no metrics");
  }
  const selectedIds = new Set<string>();
  let differentialCount = 0;
  for (const selection of selections) {
    const metric = lookupMetricDescriptor(selection.metricId);
    if (metric === null || !classMetricIds.includes(selection.metricId)) {
      return reject(
        "descriptor/metric-not-selected-for-class",
        `metric ${selection.metricId} is not selected for capability class ${descriptor.capabilityClass}`,
      );
    }
    if (selectedIds.has(selection.metricId)) {
      return reject("descriptor/duplicate-metric", `metric ${selection.metricId} is selected more than once`);
    }
    selectedIds.add(selection.metricId);
    if (!Number.isFinite(selection.weight) || selection.weight <= 0 || selection.weight > 1) {
      return reject("descriptor/invalid-weight", `weight for ${selection.metricId} must be in (0,1]`);
    }
    const threshold = selection.qualificationThreshold;
    if (threshold !== undefined && (!Number.isFinite(threshold) || (metric.unit === RATIO_UNIT && !inRatioRange(threshold)))) {
      return reject("descriptor/invalid-threshold", `threshold for ${selection.metricId} is non-finite or out of unit range`);
    }
    const differential = selection.differential;
    if (differential !== undefined) {
      if (
        !Number.isFinite(differential.comparableTolerance) ||
        !Number.isFinite(differential.superiorityMargin) ||
        differential.comparableTolerance < 0 ||
        differential.superiorityMargin <= differential.comparableTolerance
      ) {
        return reject(
          "descriptor/invalid-differential-band",
          `differential band for ${selection.metricId} needs comparableTolerance >= 0 and superiorityMargin > comparableTolerance`,
        );
      }
      differentialCount += 1;
    }
  }
  const constrainedIds = new Set<string>();
  for (const constraint of descriptor.hardConstraints) {
    if (!selectedIds.has(constraint.metricId)) {
      return reject(
        "descriptor/hard-constraint-unknown-metric",
        `hard constraint targets unselected metric ${constraint.metricId}`,
      );
    }
    if (constrainedIds.has(constraint.metricId)) {
      return reject("descriptor/duplicate-hard-constraint", `duplicate hard constraint for ${constraint.metricId}`);
    }
    constrainedIds.add(constraint.metricId);
    const metric = lookupMetricDescriptor(constraint.metricId);
    if (
      metric === null ||
      !Number.isFinite(constraint.value) ||
      (metric.unit === RATIO_UNIT && !inRatioRange(constraint.value)) ||
      typeof constraint.rationale !== "string" ||
      constraint.rationale.trim() === ""
    ) {
      return reject(
        "descriptor/invalid-hard-constraint",
        `hard constraint for ${constraint.metricId} has a non-finite/out-of-range value or an empty rationale`,
      );
    }
  }
  const policy = descriptor.qualificationPolicy;
  if (
    !Number.isInteger(policy.minQualifiedMetrics) ||
    policy.minQualifiedMetrics < 1 ||
    policy.minQualifiedMetrics > selections.length ||
    !Number.isInteger(policy.minDifferentialMetrics) ||
    policy.minDifferentialMetrics < 0 ||
    policy.minDifferentialMetrics > differentialCount
  ) {
    return reject(
      "descriptor/invalid-qualification-policy",
      `qualification policy must satisfy 1 <= minQualifiedMetrics <= ${selections.length} and 0 <= minDifferentialMetrics <= ${differentialCount}`,
    );
  }
  return { ok: true, descriptorDigest: digestOf(descriptor) };
}

/** Digest binding the complete benchmark descriptor declaration. */
export function descriptorDigestOf(descriptor: BenchmarkDescriptor): string {
  return digestOf(descriptor);
}
