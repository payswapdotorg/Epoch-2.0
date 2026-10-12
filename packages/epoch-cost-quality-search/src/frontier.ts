import { compareStrings } from "./internal/compare.js";
import type { SolutionCandidate } from "./generation.js";
import { findReading, type MetricDirection } from "./metrics.js";
import {
  aggregateLifecycleCosts,
  type CostAggregate,
  type CurrencyConversion,
  type LifecycleCost,
} from "./cost.js";
import {
  checkHardConstraint,
  type ComparisonOp,
  type ConstraintCheck,
  type HardConstraint,
  type HardConstraintKind,
  type WeightedPreference,
} from "./requirements.js";

/**
 * Frontier evaluation (W033). Policies, all deterministic:
 *
 * - Hard constraints fail closed: a violation, a missing constrained
 *   metric or a unit mismatch rejects the candidate REGARDLESS of price.
 * - Preferences are soft: they never reject; weights are data.
 * - Cost (lifecycle point total in the reporting currency) is always an
 *   objective; a candidate without usable cost data is rejected.
 * - Pareto dominance runs on raw objective vectors. A candidate missing a
 *   preference metric is INCOMPARABLE: it can neither dominate nor be
 *   dominated, so it stays on the frontier (reported via
 *   incompleteObjectives).
 * - Dominated candidates name their dominator: the lexicographically
 *   smallest dominating feasible candidateId.
 * - Preference scores normalize each metric over the FEASIBLE set
 *   (min-max; 1 for everyone when the span is 0) and multiply by the
 *   declared weight; scores are therefore interdependent by design.
 * - Every output list is ordered lexicographically by identifier.
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

const COST_OBJECTIVE_ID = "lifecycle-cost";

interface WorkingEvaluation {
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

interface PreferenceObjective {
  readonly objectiveId: string;
  readonly metricId: string;
  readonly direction: MetricDirection;
}

export function evaluateFrontier(
  candidates: readonly SolutionCandidate[],
  constraints: readonly HardConstraint[],
  preferences: readonly WeightedPreference[],
  costs: readonly LifecycleCost[],
  options: FrontierOptions = {},
): FrontierResult {
  const reportingCurrency =
    options.reportingCurrency === undefined
      ? "USD"
      : options.reportingCurrency;
  const sortedConstraints = [...constraints].sort((a, b) =>
    compareStrings(a.constraintId, b.constraintId),
  );
  const sortedPreferences = [...preferences].sort((a, b) =>
    compareStrings(a.preferenceId, b.preferenceId),
  );
  const sortedCandidates = [...candidates].sort((a, b) =>
    compareStrings(a.candidateId, b.candidateId),
  );

  const ledgersBySubject = new Map<string, LifecycleCost[]>();
  for (const ledger of costs) {
    const list = ledgersBySubject.get(ledger.subjectId);
    if (list === undefined) {
      ledgersBySubject.set(ledger.subjectId, [ledger]);
    } else {
      list.push(ledger);
    }
  }

  const working: WorkingEvaluation[] = [];
  const seenIds = new Set<string>();
  for (const candidate of sortedCandidates) {
    working.push(
      evaluateConstraintsAndCost(
        candidate,
        seenIds.has(candidate.candidateId),
        sortedConstraints,
        ledgersBySubject.get(candidate.candidateId) ?? [],
        reportingCurrency,
        options.currencyConversions ?? [],
      ),
    );
    seenIds.add(candidate.candidateId);
  }

  const preferenceObjectives = dedupePreferenceObjectives(sortedPreferences);
  const objectiveIds = [
    ...new Set([
      COST_OBJECTIVE_ID,
      ...preferenceObjectives.map((objective) => objective.metricId),
    ]),
  ].sort(compareStrings);

  const feasible = working.filter((entry) => entry.status === "pending");
  for (const entry of feasible) {
    attachObjectives(entry, preferenceObjectives);
  }
  classifyDominance(feasible);
  scorePreferences(feasible, sortedPreferences);

  const frontierEntries = feasible.filter(
    (entry) => entry.status === "frontier",
  );
  const rankedFrontier = [...frontierEntries]
    .sort(
      (a, b) =>
        b.preferenceScoreTotal - a.preferenceScoreTotal ||
        compareStrings(a.candidate.candidateId, b.candidate.candidateId),
    )
    .map((entry, index) => ({
      rank: index + 1,
      candidateId: entry.candidate.candidateId,
      preferenceScoreTotal: entry.preferenceScoreTotal,
    }));
  return {
    reportingCurrency,
    evaluated: working.map(finalize),
    frontierCandidateIds: frontierEntries.map(
      (entry) => entry.candidate.candidateId,
    ),
    rankedFrontier,
    objectiveIds,
  };
}

function evaluateConstraintsAndCost(
  candidate: SolutionCandidate,
  isDuplicate: boolean,
  constraints: readonly HardConstraint[],
  ledgers: readonly LifecycleCost[],
  reportingCurrency: string,
  conversions: readonly CurrencyConversion[],
): WorkingEvaluation {
  const rejectionReasons: RejectionReason[] = [];
  if (isDuplicate) {
    rejectionReasons.push({ kind: "duplicate-candidate-id" });
  }
  const constraintChecks: ConstraintCheck[] = [];
  for (const constraint of constraints) {
    const check = checkHardConstraint(constraint, candidate.predictedMetrics);
    constraintChecks.push(check);
    if (check.status === "fail") {
      rejectionReasons.push({
        kind: "constraint-violation",
        constraintId: constraint.constraintId,
        constraintKind: constraint.kind,
        metricId: check.metricId,
        observed: check.observed,
        op: check.op,
        bound: check.bound,
      });
    } else if (check.status === "metric-unavailable") {
      rejectionReasons.push({
        kind: "constraint-metric-unavailable",
        constraintId: constraint.constraintId,
        metricId: check.metricId,
      });
    } else if (check.status === "unit-mismatch") {
      rejectionReasons.push({
        kind: "constraint-unit-mismatch",
        constraintId: constraint.constraintId,
        metricId: check.metricId,
        constraintUnit: check.constraintUnit,
        readingUnit: check.readingUnit,
      });
    }
  }

  let cost: CostAggregate | null = null;
  if (ledgers.length === 0) {
    rejectionReasons.push({ kind: "cost-record-missing" });
  } else {
    const merged: LifecycleCost = {
      subjectId: candidate.candidateId,
      entries: ledgers.flatMap((ledger) => [...ledger.entries]),
    };
    const aggregation = aggregateLifecycleCosts(
      merged,
      reportingCurrency,
      conversions,
    );
    const declaredEntries = merged.entries.length;
    if (aggregation.aggregate.convertedEntryCount === 0 && declaredEntries > 0) {
      if (aggregation.aggregate.unconvertedCurrencies.length > 0) {
        rejectionReasons.push({
          kind: "cost-unconvertible",
          currencies: aggregation.aggregate.unconvertedCurrencies,
        });
      } else {
        rejectionReasons.push({
          kind: "cost-aggregation-issue",
          detail: "cost record has entries but none validated",
        });
      }
    } else {
      cost = aggregation.aggregate;
    }
  }

  return {
    candidate,
    status: rejectionReasons.length > 0 ? "rejected" : "pending",
    constraintChecks,
    cost,
    rejectionReasons,
    objectives: [],
    incompleteObjectives: [],
    preferenceScores: [],
    preferenceScoreTotal: 0,
    dominatorCandidateId: null,
  };
}

function dedupePreferenceObjectives(
  preferences: readonly WeightedPreference[],
): PreferenceObjective[] {
  const objectives: PreferenceObjective[] = [];
  const seen = new Set<string>();
  for (const preference of preferences) {
    if (seen.has(preference.metricId)) {
      continue;
    }
    seen.add(preference.metricId);
    objectives.push({
      objectiveId: preference.metricId,
      metricId: preference.metricId,
      direction: preference.direction,
    });
  }
  return objectives;
}

function attachObjectives(
  entry: WorkingEvaluation,
  preferenceObjectives: readonly PreferenceObjective[],
): void {
  const objectives: ObjectiveValue[] = [];
  const incomplete: string[] = [];
  if (entry.cost !== null) {
    objectives.push({
      objectiveId: COST_OBJECTIVE_ID,
      direction: "minimize",
      value: entry.cost.totalPoint,
    });
  }
  for (const objective of preferenceObjectives) {
    const reading = findReading(
      entry.candidate.predictedMetrics,
      objective.metricId,
    );
    if (reading === undefined) {
      incomplete.push(objective.objectiveId);
      continue;
    }
    objectives.push({
      objectiveId: objective.objectiveId,
      direction: objective.direction,
      value: reading.value,
    });
  }
  entry.objectives = objectives;
  entry.incompleteObjectives = incomplete;
}

function classifyDominance(feasible: readonly WorkingEvaluation[]): void {
  for (const entry of feasible) {
    if (entry.incompleteObjectives.length > 0) {
      entry.status = "frontier"; // incomparable: never dominates, never dominated
      continue;
    }
    let dominator: string | null = null;
    for (const other of feasible) {
      if (other === entry || other.incompleteObjectives.length > 0) {
        continue;
      }
      if (dominates(other, entry)) {
        const id = other.candidate.candidateId;
        if (dominator === null || compareStrings(id, dominator) < 0) {
          dominator = id;
        }
      }
    }
    if (dominator === null) {
      entry.status = "frontier";
    } else {
      entry.status = "dominated";
      entry.dominatorCandidateId = dominator;
    }
  }
}

function dominates(a: WorkingEvaluation, b: WorkingEvaluation): boolean {
  const bValues = new Map(
    b.objectives.map((objective) => [objective.objectiveId, objective] as const),
  );
  let strictlyBetter = false;
  for (const objective of a.objectives) {
    const other = bValues.get(objective.objectiveId);
    if (other === undefined) {
      return false;
    }
    const betterOrEqual =
      objective.direction === "minimize"
        ? objective.value <= other.value
        : objective.value >= other.value;
    if (!betterOrEqual) {
      return false;
    }
    const strictly =
      objective.direction === "minimize"
        ? objective.value < other.value
        : objective.value > other.value;
    if (strictly) {
      strictlyBetter = true;
    }
  }
  return strictlyBetter && a.objectives.length === b.objectives.length;
}

function scorePreferences(
  feasible: readonly WorkingEvaluation[],
  preferences: readonly WeightedPreference[],
): void {
  for (const entry of feasible) {
    entry.preferenceScores = [];
    entry.preferenceScoreTotal = 0;
  }
  for (const preference of preferences) {
    const valueByEntry = new Map<WorkingEvaluation, number>();
    for (const entry of feasible) {
      const reading = findReading(
        entry.candidate.predictedMetrics,
        preference.metricId,
      );
      if (reading !== undefined) {
        valueByEntry.set(entry, reading.value);
      }
    }
    const values = [...valueByEntry.values()];
    if (values.length === 0) {
      for (const entry of feasible) {
        entry.preferenceScores.push({
          preferenceId: preference.preferenceId,
          metricId: preference.metricId,
          status: "metric-unavailable",
          score: 0,
        });
      }
      continue;
    }
    let min = values[0];
    let max = values[0];
    for (const value of values) {
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }
    const span = max - min;
    for (const entry of feasible) {
      const value = valueByEntry.get(entry);
      if (value === undefined) {
        entry.preferenceScores.push({
          preferenceId: preference.preferenceId,
          metricId: preference.metricId,
          status: "metric-unavailable",
          score: 0,
        });
        continue;
      }
      const normalized =
        span === 0
          ? 1
          : preference.direction === "minimize"
            ? (max - value) / span
            : (value - min) / span;
      const score = preference.weight * normalized;
      entry.preferenceScores.push({
        preferenceId: preference.preferenceId,
        metricId: preference.metricId,
        status: "scored",
        score,
      });
      entry.preferenceScoreTotal += score;
    }
  }
}

function finalize(entry: WorkingEvaluation): CandidateEvaluation {
  // classifyDominance replaces every "pending" status with "frontier" or
  // "dominated" before finalize runs; the defensive fallback keeps that
  // invariant honest without a cast.
  const status: CandidateEvaluation["status"] =
    entry.status === "pending" ? "frontier" : entry.status;
  return {
    candidateId: entry.candidate.candidateId,
    status,
    constraintChecks: entry.constraintChecks,
    cost: entry.cost,
    objectives: entry.objectives,
    incompleteObjectives: entry.incompleteObjectives,
    preferenceScores: entry.preferenceScores,
    preferenceScoreTotal: entry.preferenceScoreTotal,
    dominatorCandidateId: entry.dominatorCandidateId,
    rejectionReasons: entry.rejectionReasons,
  };
}
