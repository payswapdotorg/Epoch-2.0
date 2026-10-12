import { digestRecord, isValidDigest } from "./hashing.js";

/**
 * Capability measurements (W032 §6) — quality, safety AND intervention cost.
 *
 * A measurement snapshot references a W030 qualification decision by digest
 * only: the decision semantics stay with `epoch-capability-evaluation`
 * (no second semantic authority). Intervention cost is weighted, not merely
 * counted — expert escalations weigh more than routine interventions.
 */

/** Outcome of the referenced W030 qualification decision (digest-referenced view). */
export type QualificationOutcome = "qualified" | "not-qualified";

export interface QualificationRef {
  readonly decisionDigest: string;
  readonly outcome: QualificationOutcome;
}

export interface QualityReading {
  readonly score: number;
  readonly benchmarkRef: string;
  readonly sampleCount: number;
}

export interface SafetyReading {
  readonly score: number;
  readonly incidents: number;
  readonly evidenceDigest: string;
}

export interface InterventionCostReading {
  readonly routineInterventions: number;
  readonly expertEscalations: number;
  readonly meanStepsPerEpisode: number;
}

/** Intervention-cost weights (data): expert escalations cost more than routine interventions. */
export const INTERVENTION_COST_WEIGHTS = { routine: 1, expert: 5 } as const;

/** Weighted intervention cost in cost units — never a bare count. */
export function interventionCostUnits(
  reading: InterventionCostReading,
): number {
  return (
    reading.routineInterventions * INTERVENTION_COST_WEIGHTS.routine +
    reading.expertEscalations * INTERVENTION_COST_WEIGHTS.expert
  );
}

export interface MeasurementDraft {
  readonly epochRef: string;
  readonly evaluation: QualificationRef;
  readonly quality: QualityReading;
  readonly safety: SafetyReading;
  readonly interventionCost: InterventionCostReading;
  readonly measurementBasis: string;
}

/** A digest-versioned measurement snapshot. */
export interface MeasurementSnapshot {
  readonly snapshotDigest: string;
  readonly epochRef: string;
  readonly evaluation: QualificationRef;
  readonly quality: QualityReading;
  readonly safety: SafetyReading;
  readonly interventionCost: InterventionCostReading;
  readonly measurementBasis: string;
}

export type MeasurementRejection =
  | "invalid-evaluation-reference"
  | "score-out-of-range"
  | "negative-count"
  | "missing-epoch-reference"
  | "missing-measurement-basis";

export type MeasurementDefinition =
  | { readonly kind: "defined"; readonly snapshot: MeasurementSnapshot }
  | {
      readonly kind: "rejected";
      readonly reason: MeasurementRejection;
      readonly detail: string;
    };

/** Scores are normalized to [0, 1]; counts and step measurements are non-negative. */
export function defineMeasurementSnapshot(
  draft: MeasurementDraft,
): MeasurementDefinition {
  if (!isValidDigest(draft.evaluation.decisionDigest)) {
    return {
      kind: "rejected",
      reason: "invalid-evaluation-reference",
      detail: "qualification decision must be referenced by a 64-hex digest",
    };
  }
  if (
    draft.quality.score < 0 ||
    draft.quality.score > 1 ||
    draft.safety.score < 0 ||
    draft.safety.score > 1
  ) {
    return {
      kind: "rejected",
      reason: "score-out-of-range",
      detail: "quality and safety scores are normalized to [0, 1]",
    };
  }
  if (
    draft.quality.sampleCount < 0 ||
    draft.safety.incidents < 0 ||
    draft.interventionCost.routineInterventions < 0 ||
    draft.interventionCost.expertEscalations < 0 ||
    draft.interventionCost.meanStepsPerEpisode < 0
  ) {
    return {
      kind: "rejected",
      reason: "negative-count",
      detail: "counts and step measurements must be non-negative",
    };
  }
  if (draft.epochRef.trim() === "") {
    return {
      kind: "rejected",
      reason: "missing-epoch-reference",
      detail: "measurements must reference the epoch they were taken in",
    };
  }
  if (draft.measurementBasis.trim() === "") {
    return {
      kind: "rejected",
      reason: "missing-measurement-basis",
      detail: "measurement basis must be stated",
    };
  }
  const core = {
    epochRef: draft.epochRef,
    evaluation: draft.evaluation,
    quality: draft.quality,
    safety: draft.safety,
    interventionCost: draft.interventionCost,
    measurementBasis: draft.measurementBasis,
  };
  return {
    kind: "defined",
    snapshot: {
      ...core,
      snapshotDigest: digestRecord("measurement-snapshot", core),
    },
  };
}
