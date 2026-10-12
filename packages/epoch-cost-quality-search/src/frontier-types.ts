import type { CostAggregate, CurrencyConversion } from "./cost.js";
import type { SolutionCandidate } from "./generation.js";
import type { MetricDirection } from "./metrics.js";
import type {
  ComparisonOp,
  ConstraintCheck,
  HardConstraintKind,
} from "./requirements.js";

/**
 * Frontier module, part 1: the public types of frontier evaluation plus
 * the internal working state shared by ./frontier.ts (feasibility +
 * orchestration) and ./frontier-dominance.ts (Pareto dominance and
 * preference scoring). Line-limit split only; semantics unchanged.
 */

export interface FrontierOptions {
  /** Currency all costs are reported in. Default "USD". */
  readonly reportingCurrency?: string;
  /** Declared direct conversion rates (data, never fetched). */
  readonly currencyConversions?: readonly CurrencyConversion[];
}

export type RejectionReason =
  | {
      readonly kind: "constraint-violation";
      readonly constraintId: string;
      readonly constraintKind: HardConstraintKind;
      readonly metricId: string;
      readonly observed: number;
      readonly op: ComparisonOp;
      readonly bound: number;
    }
  | {
      readonly kind: "constraint-metric-unavailable";
      readonly constraintId: string;
      readonly metricId: string;
    }
  | {
      readonly kind: "constraint-unit-mismatch";
      readonly constraintId: string;
      readonly metricId: string;
      readonly constraintUnit: string;
      readonly readingUnit: string;
    }
  | { readonly kind: "cost-record-missing" }
  | {
      readonly kind: "cost-unconvertible";
      readonly currencies: readonly string[];
    }
  | {
      readonly kind: "cost-aggregation-issue";
      readonly detail: string;
    }
  | { readonly kind: "duplicate-candidate-id" };

export interface ObjectiveValue {
  readonly objectiveId: string;
  readonly direction: MetricDirection;
  readonly value: number;
}

export interface PreferenceScore {
  readonly preferenceId: string;
  readonly metricId: string;
  readonly status: "scored" | "metric-unavailable";
  readonly score: number;
}

export interface CandidateEvaluation {
  readonly candidateId: string;
  readonly status: "frontier" | "dominated" | "rejected";
  readonly constraintChecks: readonly ConstraintCheck[];
  readonly cost: CostAggregate | null;
  readonly objectives: readonly ObjectiveValue[];
  readonly incompleteObjectives: readonly string[];
  readonly preferenceScores: readonly PreferenceScore[];
  readonly preferenceScoreTotal: number;
  readonly dominatorCandidateId: string | null;
  readonly rejectionReasons: readonly RejectionReason[];
}

export interface FrontierRanking {
  readonly rank: number;
  readonly candidateId: string;
  readonly preferenceScoreTotal: number;
}

export interface FrontierResult {
  readonly reportingCurrency: string;
  readonly evaluated: readonly CandidateEvaluation[];
  readonly frontierCandidateIds: readonly string[];
  readonly rankedFrontier: readonly FrontierRanking[];
  readonly objectiveIds: readonly string[];
}

/** Internal: objective id of the lifecycle-cost point total. */
export const COST_OBJECTIVE_ID = "lifecycle-cost";

/** Internal: mutable working record during evaluation. */
export interface WorkingEvaluation {
  candidate: SolutionCandidate;
  status: "pending" | "rejected" | "dominated" | "frontier";
  constraintChecks: ConstraintCheck[];
  cost: CostAggregate | null;
  rejectionReasons: RejectionReason[];
  objectives: ObjectiveValue[];
  incompleteObjectives: string[];
  preferenceScores: PreferenceScore[];
  preferenceScoreTotal: number;
  dominatorCandidateId: string | null;
}

/** Internal: one preference metric projected onto the objective space. */
export interface PreferenceObjective {
  readonly objectiveId: string;
  readonly metricId: string;
  readonly direction: MetricDirection;
}
