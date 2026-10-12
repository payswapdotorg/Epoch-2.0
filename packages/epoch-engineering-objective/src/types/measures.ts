import type { Sha256Digest } from "../canonical.js";
import type {
  DigestRef,
  DurationMeasure,
  MonetaryCost,
  QualityAcceptanceThreshold,
  QualityScore,
  TaskFamilyRef,
} from "./core.js";
import type { VerifiedQualityMetric } from "./completion.js";
import type { SafetyRegressionMeasure } from "./safety.js";

/** The scope a baseline measure applies to. */
export type BaselineScope =
  | { readonly scope: "task-family" }
  | { readonly scope: "task-class"; readonly taskClassId: string }
  | { readonly scope: "task"; readonly taskId: string };

/** Cost/time (and intervention-count) baseline for a scope (W035 item 3). */
export interface BaselineMeasure {
  readonly kind: "baseline-measure";
  readonly baselineId: string;
  readonly familyRef: TaskFamilyRef;
  readonly scope: BaselineScope;
  readonly interventionCount: number | null;
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly provenance: readonly DigestRef[];
  readonly baselineDigest: Sha256Digest;
}

/** Human intervention counts AND costs, via W032 semantics. */
export interface InterventionMeasure {
  readonly kind: "intervention-measure";
  readonly interventionId: string;
  readonly familyRef: TaskFamilyRef;
  readonly taskId: string;
  readonly interventionCount: number;
  readonly monetaryCost: MonetaryCost | null;
  readonly duration: DurationMeasure | null;
  readonly learningRef: DigestRef;
  readonly measureDigest: Sha256Digest;
}

/** Typed reasons the intervention gate can block a reduction. */
export type InterventionNonQualificationReason =
  | "no-baseline"
  | "baseline-family-mismatch"
  | "baseline-lacks-intervention-count"
  | "not-fewer-interventions"
  | "paired-quality-mismatch"
  | "quality-unverified"
  | "quality-below-threshold"
  | "safety-regression-present";

/** Fewer interventions that PASSED the quality/safety gate (typed law). */
export interface QualifiedInterventionProgress {
  readonly kind: "qualified-progress";
  readonly interventionId: string;
  readonly taskId: string;
  readonly interventionCount: number;
  readonly baselineInterventionCount: number;
  readonly pairedQualityMetricId: string;
  readonly pairedQualityScore: QualityScore;
  readonly safetyRegressionCount: 0;
  readonly law: "fewer-interventions-count-as-progress-only-with-acceptable-verified-quality-and-no-safety-regression";
}

/** A reduction that does NOT count as progress, with the typed reason. */
export interface NonQualifyingInterventionProgress {
  readonly kind: "not-qualifying";
  readonly interventionId: string;
  readonly taskId: string;
  readonly reason: InterventionNonQualificationReason;
  readonly detail: string;
}

export type InterventionProgress =
  | QualifiedInterventionProgress
  | NonQualifyingInterventionProgress;

/** Input to the intervention-progress gate machine. */
export interface InterventionProgressInput {
  readonly intervention: InterventionMeasure;
  readonly baseline: BaselineMeasure | null;
  readonly pairedQuality: VerifiedQualityMetric | null;
  readonly acceptance: QualityAcceptanceThreshold;
  readonly safetyRegressions: readonly SafetyRegressionMeasure[];
}
