import { compareStrings } from "./internal/compare.js";
import type { SolutionCandidate } from "./generation.js";
import {
  aggregateLifecycleCosts,
  type CostAggregate,
  type CurrencyConversion,
  type LifecycleCost,
} from "./cost.js";
import {
  checkHardConstraint,
  type ConstraintCheck,
  type HardConstraint,
  type WeightedPreference,
} from "./requirements.js";
import {
  COST_OBJECTIVE_ID,
  type CandidateEvaluation,
  type FrontierOptions,
  type FrontierResult,
  type RejectionReason,
  type WorkingEvaluation,
} from "./frontier-types.js";
import {
  attachObjectives,
  classifyDominance,
  dedupePreferenceObjectives,
  scorePreferences,
} from "./frontier-dominance.js";

export type {
  FrontierOptions,
  RejectionReason,
  ObjectiveValue,
  PreferenceScore,
  CandidateEvaluation,
  FrontierRanking,
  FrontierResult,
} from "./frontier-types.js";

/**
 * Frontier evaluation (W033), part 3: orchestration and feasibility.
 * Policies, all deterministic:
 *
 * - Hard constraints fail closed: a violation, a missing constrained
 *   metric or a unit mismatch rejects the candidate REGARDLESS of price.
 * - Preferences are soft: they never reject; weights are data.
 * - Cost (lifecycle point total in the reporting currency) is always an
 *   objective; a candidate without usable cost data is rejected.
 * - Dominance and preference scoring live in ./frontier-dominance.ts.
 * - Every output list is ordered lexicographically by identifier.
 */

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
