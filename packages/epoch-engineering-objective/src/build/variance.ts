import { digestCanonical } from "../canonical.js";
import { kebabId, nonEmptyString } from "../validate.js";
import {
  normalizeDigestRef,
  normalizeDurationMeasure,
  normalizeMonetaryCost,
  qualityScore,
} from "../types/core.js";
import type {
  DigestRefInput,
  DurationMeasure,
  MonetaryCost,
  QualityAcceptanceThreshold,
} from "../types/core.js";
import type {
  AbundanceClaim,
  AbundanceClaimBlockReason,
  Feasibility,
  LowerCostClaim,
  NoAbundanceClaim,
  OutcomeActual,
  OutcomePrediction,
  PredictionVarianceRecord,
} from "../types/variance.js";
import type { VerifiedQualityMetric } from "../types/completion.js";
import { effectiveQualityScore } from "./completion.js";
import { normalizeFamilyRefInput } from "./denominators.js";
import type { FamilyRefInput } from "./denominators.js";

export interface OutcomePredictionInput {
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly predictedQualityScore: number | null;
  readonly frontierRef: DigestRefInput;
}

export interface OutcomeActualInput {
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly verifiedQuality: VerifiedQualityMetric | null;
}

export type FeasibilityInput =
  | {
      readonly feasible: true;
      readonly solutionRef: DigestRefInput;
      readonly note: string;
    }
  | { readonly feasible: false; readonly reason: string };

function normalizePrediction(prediction: OutcomePredictionInput): OutcomePrediction {
  return {
    kind: "outcome-prediction",
    monetaryCost:
      prediction.monetaryCost === null
        ? null
        : normalizeMonetaryCost(prediction.monetaryCost),
    duration:
      prediction.duration === null ? null : normalizeDurationMeasure(prediction.duration),
    predictedQualityScore:
      prediction.predictedQualityScore === null
        ? null
        : qualityScore(prediction.predictedQualityScore),
    frontierRef: normalizeDigestRef(prediction.frontierRef),
  };
}

function normalizeActual(actual: OutcomeActualInput): OutcomeActual {
  return {
    kind: "outcome-actual",
    monetaryCost:
      actual.monetaryCost === null ? null : normalizeMonetaryCost(actual.monetaryCost),
    duration:
      actual.duration === null ? null : normalizeDurationMeasure(actual.duration),
    verifiedQuality: actual.verifiedQuality,
  };
}

function normalizeFeasibility(feasibility: FeasibilityInput): Feasibility {
  if (
    feasibility === null ||
    typeof feasibility !== "object" ||
    typeof feasibility.feasible !== "boolean"
  ) {
    throw new TypeError(
      "predictionVarianceRecord.feasibility: feasibility object expected"
    );
  }
  if (feasibility.feasible) {
    return {
      feasible: true,
      solutionRef: normalizeDigestRef(feasibility.solutionRef),
      note: nonEmptyString("feasibility.note", feasibility.note),
    };
  }
  return { feasible: false, reason: nonEmptyString("feasibility.reason", feasibility.reason) };
}

export interface PredictionVarianceRecordInput {
  readonly varianceId: string;
  readonly familyRef: FamilyRefInput;
  readonly taskId: string;
  readonly predicted: OutcomePredictionInput;
  readonly actual: OutcomeActualInput;
  readonly feasibility: FeasibilityInput;
}

/** Build a predicted-vs-actual record per W033 semantics. */
export function predictionVarianceRecord(
  input: PredictionVarianceRecordInput
): PredictionVarianceRecord {
  const record: Omit<PredictionVarianceRecord, "recordDigest"> = {
    kind: "prediction-variance-record",
    varianceId: kebabId("predictionVarianceRecord.varianceId", input.varianceId),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    taskId: kebabId("predictionVarianceRecord.taskId", input.taskId),
    predicted: normalizePrediction(input.predicted),
    actual: normalizeActual(input.actual),
    feasibility: normalizeFeasibility(input.feasibility),
  };
  return { ...record, recordDigest: digestCanonical(record) };
}

/**
 * The feasibility gate (typed law): lower cost is claimed ONLY for feasible
 * solutions whose actual outcome carries VERIFIED quality at or above the
 * acceptance threshold. Every block reason is typed.
 */
export function evaluateAbundanceClaim(
  record: PredictionVarianceRecord,
  acceptance: QualityAcceptanceThreshold
): AbundanceClaim {
  const noClaim = (
    reason: AbundanceClaimBlockReason,
    detail: string
  ): NoAbundanceClaim => ({
    kind: "no-claim",
    varianceId: record.varianceId,
    taskId: record.taskId,
    reason,
    detail,
  });
  if (!record.feasibility.feasible) {
    return noClaim(
      "infeasible-solution",
      `the solution is infeasible: ${record.feasibility.reason}`
    );
  }
  const predictedCost = record.predicted.monetaryCost;
  if (predictedCost === null) {
    return noClaim(
      "no-cost-prediction",
      "the prediction records no monetary cost to compare against"
    );
  }
  const actualCost = record.actual.monetaryCost;
  if (actualCost === null) {
    return noClaim("no-cost-actual", "the actual outcome records no monetary cost");
  }
  if (predictedCost.currencyCode !== actualCost.currencyCode) {
    return noClaim(
      "currency-mismatch",
      `predicted currency ${predictedCost.currencyCode} does not match actual currency ${actualCost.currencyCode}`
    );
  }
  if (actualCost.minorUnits >= predictedCost.minorUnits) {
    return noClaim(
      "actual-not-lower",
      `actual cost ${actualCost.minorUnits} minor units is not lower than the predicted ${predictedCost.minorUnits}`
    );
  }
  const quality = record.actual.verifiedQuality;
  const score = quality === null ? null : effectiveQualityScore(quality);
  if (score === null) {
    return noClaim(
      "quality-unverified",
      "the actual outcome carries no verified quality (W020); unverified outputs never count"
    );
  }
  if (score < acceptance.minimumVerifiedScore) {
    return noClaim(
      "quality-below-threshold",
      `verified quality score ${score} is below the acceptance threshold ${acceptance.minimumVerifiedScore}`
    );
  }
  const claim: LowerCostClaim = {
    kind: "lower-cost-claim",
    varianceId: record.varianceId,
    taskId: record.taskId,
    currencyCode: actualCost.currencyCode,
    claimedReductionMinorUnits: predictedCost.minorUnits - actualCost.minorUnits,
    verifiedQualityScore: score,
    law: "lower-cost-claimed-only-for-feasible-solutions-with-verified-quality",
  };
  return claim;
}
