import { digestRecord, isValidDigest } from "./hashing.js";
import { interventionCostUnits } from "./measurement.js";
import type {
  MeasurementSnapshot,
  QualificationOutcome,
} from "./measurement.js";
import type { AutonomyLevel } from "./autonomy.js";
import type { GuardedMetric, RollbackTrigger } from "./rollback.js";

/**
 * Regression monitoring (W032 §6).
 *
 * A regression watch compares digest-versioned before/after measurement
 * snapshots. Qualification comparison reuses W030 decision outcomes
 * (referenced by digest — W030 remains the semantic authority, recorded via
 * `evaluationSemanticsRef`); metric comparison covers quality, safety AND
 * weighted intervention cost. The watch emits advisory rollback signals
 * only — humans decide (no execution authority).
 */

/** Comparison tolerances (data): deltas beyond these count as regression or improvement. */
export const REGRESSION_TOLERANCES: Readonly<Record<GuardedMetric, number>> = {
  quality: 0.02,
  safety: 0.02,
  "intervention-cost": 0.5,
};

export type QualificationComparison = "improved" | "unchanged" | "degraded";

export type RegressionVerdict = "improved" | "stable" | "regressed";

export type MetricDirection = "higher-is-better" | "lower-is-better";

export interface RegressionFinding {
  readonly metric: GuardedMetric;
  readonly delta: number;
  readonly tolerance: number;
  readonly direction: MetricDirection;
  readonly severity: "regression" | "improvement" | "unchanged";
}

export interface RegressionComparison {
  readonly qualification: QualificationComparison;
  readonly qualityDelta: number;
  readonly safetyDelta: number;
  readonly interventionCostDelta: number;
  readonly safetyIncidentsIncreased: boolean;
  readonly findings: readonly RegressionFinding[];
}

export interface RollbackSignal {
  readonly advisoryOnly: true;
  readonly requiresHumanDecision: true;
  readonly rollbackAdvised: boolean;
  readonly triggeredTriggers: readonly RollbackTrigger[];
}

/** Reference to an approved promotion being watched (digest refs only). */
export interface PromotionRef {
  readonly promotionId: string;
  readonly candidateId: string;
  readonly approvedLevel: AutonomyLevel;
}

export interface RegressionWatchInput {
  readonly promotion: PromotionRef;
  readonly before: MeasurementSnapshot;
  readonly triggers: readonly RollbackTrigger[];
  readonly evaluationSemanticsRef: string;
}

export type WatchRejection =
  "invalid-promotion-reference" | "missing-evaluation-semantics-reference";

export type RegressionWatchResult =
  | { readonly kind: "established"; readonly watch: RegressionWatch }
  | {
      readonly kind: "rejected";
      readonly reason: WatchRejection;
      readonly detail: string;
    };

/** A digest-versioned regression watch over one promotion. */
export interface RegressionWatch {
  readonly watchId: string;
  readonly promotion: PromotionRef;
  readonly before: MeasurementSnapshot;
  readonly triggers: readonly RollbackTrigger[];
  readonly evaluationSemanticsRef: string;
}

export function establishRegressionWatch(
  input: RegressionWatchInput,
): RegressionWatchResult {
  if (
    !isValidDigest(input.promotion.promotionId) ||
    !isValidDigest(input.promotion.candidateId)
  ) {
    return {
      kind: "rejected",
      reason: "invalid-promotion-reference",
      detail:
        "watch must reference the promotion and candidate by 64-hex digests",
    };
  }
  if (!isValidDigest(input.evaluationSemanticsRef)) {
    return {
      kind: "rejected",
      reason: "missing-evaluation-semantics-reference",
      detail:
        "watch must record the digest of the W030 regression semantics it aligns to",
    };
  }
  const core = {
    promotion: input.promotion,
    before: input.before,
    triggers: [...input.triggers],
    evaluationSemanticsRef: input.evaluationSemanticsRef,
  };
  return {
    kind: "established",
    watch: { watchId: digestRecord("regression-watch", core), ...core },
  };
}

/** A digest-versioned before/after comparison reading for one watch. */
export interface RegressionReading {
  readonly readingDigest: string;
  readonly watchId: string;
  readonly beforeSnapshotDigest: string;
  readonly afterSnapshotDigest: string;
  readonly comparison: RegressionComparison;
  readonly verdict: RegressionVerdict;
  readonly rollbackSignal: RollbackSignal;
}

export function evaluateRegression(
  watch: RegressionWatch,
  after: MeasurementSnapshot,
): RegressionReading {
  const qualification = compareQualification(
    watch.before.evaluation.outcome,
    after.evaluation.outcome,
  );
  const qualityDelta = after.quality.score - watch.before.quality.score;
  const safetyDelta = after.safety.score - watch.before.safety.score;
  const interventionCostDelta =
    interventionCostUnits(after.interventionCost) -
    interventionCostUnits(watch.before.interventionCost);
  const safetyIncidentsIncreased =
    after.safety.incidents > watch.before.safety.incidents;
  const findings: RegressionFinding[] = [
    metricFinding(
      "quality",
      qualityDelta,
      REGRESSION_TOLERANCES.quality,
      "higher-is-better",
    ),
    metricFinding(
      "safety",
      safetyDelta,
      REGRESSION_TOLERANCES.safety,
      "higher-is-better",
    ),
    metricFinding(
      "intervention-cost",
      interventionCostDelta,
      REGRESSION_TOLERANCES["intervention-cost"],
      "lower-is-better",
    ),
  ];
  const hasRegression =
    findings.some((finding) => finding.severity === "regression") ||
    safetyIncidentsIncreased ||
    qualification === "degraded";
  const hasImprovement =
    !hasRegression &&
    (qualification === "improved" ||
      findings.some((finding) => finding.severity === "improvement"));
  let verdict: RegressionVerdict;
  if (hasRegression) {
    verdict = "regressed";
  } else if (hasImprovement) {
    verdict = "improved";
  } else {
    verdict = "stable";
  }
  const triggeredTriggers = watch.triggers.filter((trigger) =>
    triggerTripped(trigger, after),
  );
  const rollbackSignal: RollbackSignal = {
    advisoryOnly: true,
    requiresHumanDecision: true,
    rollbackAdvised: triggeredTriggers.length > 0 || verdict === "regressed",
    triggeredTriggers,
  };
  const comparison: RegressionComparison = {
    qualification,
    qualityDelta,
    safetyDelta,
    interventionCostDelta,
    safetyIncidentsIncreased,
    findings,
  };
  const core = {
    watchId: watch.watchId,
    beforeSnapshotDigest: watch.before.snapshotDigest,
    afterSnapshotDigest: after.snapshotDigest,
    comparison,
    verdict,
    rollbackSignal,
  };
  return { readingDigest: digestRecord("regression-reading", core), ...core };
}

function compareQualification(
  before: QualificationOutcome,
  after: QualificationOutcome,
): QualificationComparison {
  if (before === after) {
    return "unchanged";
  }
  return before === "qualified" ? "degraded" : "improved";
}

function metricFinding(
  metric: GuardedMetric,
  delta: number,
  tolerance: number,
  direction: MetricDirection,
): RegressionFinding {
  let severity: RegressionFinding["severity"];
  if (direction === "higher-is-better") {
    if (delta < -tolerance) {
      severity = "regression";
    } else if (delta > tolerance) {
      severity = "improvement";
    } else {
      severity = "unchanged";
    }
  } else {
    if (delta > tolerance) {
      severity = "regression";
    } else if (delta < -tolerance) {
      severity = "improvement";
    } else {
      severity = "unchanged";
    }
  }
  return { metric, delta, tolerance, direction, severity };
}

function triggerTripped(
  trigger: RollbackTrigger,
  after: MeasurementSnapshot,
): boolean {
  const value = metricValue(trigger.metric, after);
  return trigger.comparator === "drops-below"
    ? value < trigger.threshold
    : value > trigger.threshold;
}

function metricValue(
  metric: GuardedMetric,
  snapshot: MeasurementSnapshot,
): number {
  switch (metric) {
    case "quality":
      return snapshot.quality.score;
    case "safety":
      return snapshot.safety.score;
    case "intervention-cost":
      return interventionCostUnits(snapshot.interventionCost);
  }
}
