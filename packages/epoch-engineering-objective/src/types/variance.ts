import type { Sha256Digest } from "../canonical.js";
import type {
  DigestRef,
  DurationMeasure,
  MonetaryCost,
  QualityScore,
  TaskFamilyRef,
} from "./core.js";
import type { VerifiedQualityMetric } from "./completion.js";

/** Predicted outcome, per W033 record semantics. */
export interface OutcomePrediction {
  readonly kind: "outcome-prediction";
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly predictedQualityScore: QualityScore | null;
  readonly frontierRef: DigestRef;
}

/** Actual outcome; only VERIFIED quality may participate in claims. */
export interface OutcomeActual {
  readonly kind: "outcome-actual";
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly verifiedQuality: VerifiedQualityMetric | null;
}

/** Typed feasibility gate: solutions must be feasible before claims. */
export type Feasibility =
  | {
      readonly feasible: true;
      readonly solutionRef: DigestRef;
      readonly note: string;
    }
  | { readonly feasible: false; readonly reason: string };

/** Predicted-vs-actual record per W033 semantics (W035 item 6). */
export interface PredictionVarianceRecord {
  readonly kind: "prediction-variance-record";
  readonly varianceId: string;
  readonly familyRef: TaskFamilyRef;
  readonly taskId: string;
  readonly predicted: OutcomePrediction;
  readonly actual: OutcomeActual;
  readonly feasibility: Feasibility;
  readonly recordDigest: Sha256Digest;
}

/** Typed reasons an abundance claim is blocked. */
export type AbundanceClaimBlockReason =
  | "infeasible-solution"
  | "no-cost-prediction"
  | "no-cost-actual"
  | "currency-mismatch"
  | "actual-not-lower"
  | "quality-unverified"
  | "quality-below-threshold";

/** A claimable lower-cost delta (feasible + verified + actually cheaper). */
export interface LowerCostClaim {
  readonly kind: "lower-cost-claim";
  readonly varianceId: string;
  readonly taskId: string;
  readonly currencyCode: string;
  readonly claimedReductionMinorUnits: number;
  readonly verifiedQualityScore: QualityScore;
  readonly law: "lower-cost-claimed-only-for-feasible-solutions-with-verified-quality";
}

/** A blocked claim with its typed reason. */
export interface NoAbundanceClaim {
  readonly kind: "no-claim";
  readonly varianceId: string;
  readonly taskId: string;
  readonly reason: AbundanceClaimBlockReason;
  readonly detail: string;
}

export type AbundanceClaim = LowerCostClaim | NoAbundanceClaim;
