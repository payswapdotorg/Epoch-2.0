import { digestCanonical } from "../canonical.js";
import { kebabId, nonNegativeInteger } from "../validate.js";
import {
  normalizeDigestRef,
  normalizeDurationMeasure,
  normalizeMonetaryCost,
} from "../types/core.js";
import type {
  DigestRefInput,
  DurationMeasure,
  MonetaryCost,
  QualityAcceptanceThreshold,
} from "../types/core.js";
import type {
  BaselineMeasure,
  BaselineScope,
  InterventionMeasure,
  InterventionNonQualificationReason,
  InterventionProgress,
  InterventionProgressInput,
  NonQualifyingInterventionProgress,
} from "../types/measures.js";
import type { VerifiedQualityMetric } from "../types/completion.js";
import { effectiveQualityScore } from "./completion.js";
import { normalizeFamilyRefInput, sameTaskFamily } from "./denominators.js";
import type { FamilyRefInput } from "./denominators.js";

export type BaselineScopeInput =
  | { readonly scope: "task-family" }
  | { readonly scope: "task-class"; readonly taskClassId: string }
  | { readonly scope: "task"; readonly taskId: string };

function normalizeBaselineScope(scope: BaselineScopeInput): BaselineScope {
  if (scope === null || typeof scope !== "object" || typeof scope.scope !== "string") {
    throw new TypeError("baselineMeasure.scope: scope object expected");
  }
  switch (scope.scope) {
    case "task-family":
      return { scope: "task-family" };
    case "task-class":
      return {
        scope: "task-class",
        taskClassId: kebabId("baselineMeasure.scope.taskClassId", scope.taskClassId),
      };
    case "task":
      return {
        scope: "task",
        taskId: kebabId("baselineMeasure.scope.taskId", scope.taskId),
      };
    default:
      // NOTE: `scope` is narrowed to `never` here (all scope literals are
      // covered above), so the message stringifies the value itself.
      throw new TypeError(
        `baselineMeasure.scope: unknown scope, got: ${JSON.stringify(scope)}`
      );
  }
}

export interface BaselineMeasureInput {
  readonly baselineId: string;
  readonly familyRef: FamilyRefInput;
  readonly scope: BaselineScopeInput;
  readonly interventionCount: number | null;
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly provenance: readonly DigestRefInput[];
}

/** Build a cost/time/intervention baseline (W035 item 3). */
export function baselineMeasure(input: BaselineMeasureInput): BaselineMeasure {
  const provenance = input.provenance.map((ref) => normalizeDigestRef(ref));
  if (provenance.length === 0) {
    throw new TypeError(
      "baselineMeasure: at least one provenance digest ref is required"
    );
  }
  if (
    input.interventionCount === null &&
    input.monetaryCost === null &&
    input.duration === null
  ) {
    throw new TypeError(
      "baselineMeasure: at least one of interventionCount, monetaryCost or duration must be measured"
    );
  }
  const record: Omit<BaselineMeasure, "baselineDigest"> = {
    kind: "baseline-measure",
    baselineId: kebabId("baselineMeasure.baselineId", input.baselineId),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    scope: normalizeBaselineScope(input.scope),
    interventionCount:
      input.interventionCount === null
        ? null
        : nonNegativeInteger(
            "baselineMeasure.interventionCount",
            input.interventionCount
          ),
    monetaryCost:
      input.monetaryCost === null ? null : normalizeMonetaryCost(input.monetaryCost),
    duration: input.duration === null ? null : normalizeDurationMeasure(input.duration),
    provenance,
  };
  return { ...record, baselineDigest: digestCanonical(record) };
}

export interface InterventionMeasureInput {
  readonly interventionId: string;
  readonly familyRef: FamilyRefInput;
  readonly taskId: string;
  readonly interventionCount: number;
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly learningRef: DigestRefInput;
}

/** Build an intervention measure (counts AND costs, W032 digest ref). */
export function interventionMeasure(
  input: InterventionMeasureInput
): InterventionMeasure {
  const record: Omit<InterventionMeasure, "measureDigest"> = {
    kind: "intervention-measure",
    interventionId: kebabId(
      "interventionMeasure.interventionId",
      input.interventionId
    ),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    taskId: kebabId("interventionMeasure.taskId", input.taskId),
    interventionCount: nonNegativeInteger(
      "interventionMeasure.interventionCount",
      input.interventionCount
    ),
    monetaryCost:
      input.monetaryCost === null ? null : normalizeMonetaryCost(input.monetaryCost),
    duration: input.duration === null ? null : normalizeDurationMeasure(input.duration),
    learningRef: normalizeDigestRef(input.learningRef),
  };
  return { ...record, measureDigest: digestCanonical(record) };
}

/**
 * The intervention gate (typed law): fewer interventions count as progress
 * ONLY when verified quality remains acceptable AND no hard-constraint
 * safety regression applies. Every block reason is typed, never implied.
 */
export function evaluateInterventionProgress(
  input: InterventionProgressInput
): InterventionProgress {
  const { intervention, baseline, pairedQuality, acceptance, safetyRegressions } =
    input;
  const notQualifying = (
    reason: InterventionNonQualificationReason,
    detail: string
  ): NonQualifyingInterventionProgress => ({
    kind: "not-qualifying",
    interventionId: intervention.interventionId,
    taskId: intervention.taskId,
    reason,
    detail,
  });

  if (baseline === null) {
    return notQualifying(
      "no-baseline",
      "no baseline measure was supplied for this intervention"
    );
  }
  if (!sameTaskFamily(baseline.familyRef, intervention.familyRef)) {
    return notQualifying(
      "baseline-family-mismatch",
      `baseline family ${baseline.familyRef.familyId}@${baseline.familyRef.version} does not match intervention family ${intervention.familyRef.familyId}@${intervention.familyRef.version}`
    );
  }
  if (baseline.interventionCount === null) {
    return notQualifying(
      "baseline-lacks-intervention-count",
      "the baseline records no intervention count to compare against"
    );
  }
  if (intervention.interventionCount >= baseline.interventionCount) {
    return notQualifying(
      "not-fewer-interventions",
      `intervention count ${intervention.interventionCount} is not lower than the baseline count ${baseline.interventionCount}`
    );
  }
  if (pairedQuality === null) {
    return notQualifying(
      "quality-unverified",
      "no paired quality metric exists for this task; unverified outputs never count as quality"
    );
  }
  if (
    pairedQuality.taskId !== intervention.taskId ||
    !sameTaskFamily(pairedQuality.familyRef, intervention.familyRef)
  ) {
    return notQualifying(
      "paired-quality-mismatch",
      `paired quality metric '${pairedQuality.metricId}' (task ${pairedQuality.taskId}) does not pair with intervention task '${intervention.taskId}'`
    );
  }
  const score = effectiveQualityScore(pairedQuality);
  if (score === null) {
    return notQualifying(
      "quality-unverified",
      `paired quality metric '${pairedQuality.metricId}' is not verified (W020); unverified outputs never count as quality`
    );
  }
  if (score < acceptance.minimumVerifiedScore) {
    return notQualifying(
      "quality-below-threshold",
      `verified quality score ${score} is below the acceptance threshold ${acceptance.minimumVerifiedScore}`
    );
  }
  const regressions = safetyRegressions.filter(
    (measure) =>
      measure.status === "regression" &&
      sameTaskFamily(measure.familyRef, intervention.familyRef) &&
      (measure.taskId === null || measure.taskId === intervention.taskId)
  );
  if (regressions.length > 0) {
    return notQualifying(
      "safety-regression-present",
      `${regressions.length} hard-constraint regression measure(s) apply to this task (constraints: ${regressions
        .map((m) => m.hardConstraintId)
        .join(", ")})`
    );
  }
  return {
    kind: "qualified-progress",
    interventionId: intervention.interventionId,
    taskId: intervention.taskId,
    interventionCount: intervention.interventionCount,
    baselineInterventionCount: baseline.interventionCount,
    pairedQualityMetricId: pairedQuality.metricId,
    pairedQualityScore: score,
    safetyRegressionCount: 0,
    law: "fewer-interventions-count-as-progress-only-with-acceptable-verified-quality-and-no-safety-regression",
  };
}
