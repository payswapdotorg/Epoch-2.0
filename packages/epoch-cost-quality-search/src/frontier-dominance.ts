import { compareStrings } from "./internal/compare.js";
import { findReading } from "./metrics.js";
import type { WeightedPreference } from "./requirements.js";
import {
  COST_OBJECTIVE_ID,
  type ObjectiveValue,
  type PreferenceObjective,
  type WorkingEvaluation,
} from "./frontier-types.js";

/**
 * Frontier module, part 2: objective attachment, Pareto dominance
 * classification and weighted preference scoring (internal helpers —
 * not part of the package's public surface; ./frontier.ts orchestrates).
 *
 * Policies (deterministic, unchanged by this file split):
 * - Pareto dominance runs on raw objective vectors. A candidate missing a
 *   preference metric is INCOMPARABLE: it can neither dominate nor be
 *   dominated, so it stays on the frontier (reported via
 *   incompleteObjectives).
 * - Dominated candidates name their dominator: the lexicographically
 *   smallest dominating feasible candidateId.
 * - Preference scores normalize each metric over the FEASIBLE set
 *   (min-max; 1 for everyone when the span is 0) and multiply by the
 *   declared weight; scores are therefore interdependent by design.
 */

export function dedupePreferenceObjectives(
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

export function attachObjectives(
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

export function classifyDominance(
  feasible: readonly WorkingEvaluation[],
): void {
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

export function scorePreferences(
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
