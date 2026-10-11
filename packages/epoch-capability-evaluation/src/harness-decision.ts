// Qualification decision synthesis for the differential conformance harness.
// Split from harness.ts to honor the max-file-lines law; logic unchanged.

import type {
  BenchmarkDescriptor,
  CapabilityUnderTest,
  MetricOutcome,
  QualificationDecision,
} from "./contract.js";
import { rankOf, stepDown } from "./qualification.js";

export function decide(
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
  const allSuperior =
    differentialOutcomes.length > 0 && differentialOutcomes.every((outcome) => outcome.differential === "superior");
  const allComparableOrBetter =
    differentialOutcomes.length > 0 &&
    differentialOutcomes.every((outcome) => outcome.differential === "superior" || outcome.differential === "comparable");
  const enoughDifferential = differentialOutcomes.length >= policy.minDifferentialMetrics;
  const evidenceSufficient =
    passing.length >= policy.minQualifiedMetrics &&
    (!policy.evidenceRequired || passing.every((outcome) => outcome.evidenceDigest !== null));
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
