import { compareStrings } from "./internal/compare.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isObject,
} from "./internal/guards.js";
import type { MetricDirection, MetricReading } from "./metrics.js";
import { findReading } from "./metrics.js";

/**
 * The W033 requirements model: a set of hard constraints (ANY failure rejects
 * a subject regardless of price) plus a set of weighted preferences (soft
 * trade-offs whose weights are data and never override hard constraints).
 * `metricId` fields reference metric descriptors (W030-style) by identifier —
 * this package consumes those references, it does not redefine them.
 */

/** The five hard-requirement families (W033 requirements model). */
export type HardConstraintKind =
  | "safety"
  | "code-quality"
  | "performance"
  | "durability"
  | "client-requirement";

/** Comparison a predicted metric value must satisfy. */
export type ComparisonOp = "<=" | ">=" | "==";

/** A hard requirement: ANY failure rejects the subject regardless of price. */
export interface HardConstraint {
  readonly constraintId: string;
  readonly kind: HardConstraintKind;
  readonly description: string;
  readonly source: string;
  readonly metricId: string;
  readonly op: ComparisonOp;
  readonly bound: number;
  readonly unit: string;
}

/** A soft trade-off: weight is DATA and never overrides hard constraints. */
export interface WeightedPreference {
  readonly preferenceId: string;
  readonly description: string;
  readonly metricId: string;
  readonly direction: MetricDirection;
  readonly weight: number;
}

export interface RequirementSet {
  readonly constraints: readonly HardConstraint[];
  readonly preferences: readonly WeightedPreference[];
}

export type RequirementIssue =
  | { readonly kind: "duplicate-constraint-id"; readonly constraintId: string }
  | { readonly kind: "duplicate-preference-id"; readonly preferenceId: string }
  | {
      readonly kind: "invalid-constraint";
      readonly constraintId: string;
      readonly detail: string;
    }
  | {
      readonly kind: "invalid-preference";
      readonly preferenceId: string;
      readonly detail: string;
    };

export interface RequirementsIntake {
  /** Valid constraints, ordered by constraintId. */
  readonly constraints: readonly HardConstraint[];
  /** Valid preferences, ordered by preferenceId. */
  readonly preferences: readonly WeightedPreference[];
  readonly issues: readonly RequirementIssue[];
}

const HARD_CONSTRAINT_KINDS: readonly string[] = [
  "safety",
  "code-quality",
  "performance",
  "durability",
  "client-requirement",
];
const COMPARISON_OPS: readonly string[] = ["<=", ">=", "=="];
const METRIC_DIRECTIONS: readonly string[] = ["minimize", "maximize"];

/** Intake gate; invalid or duplicated entries are excluded with typed issues. */
export function prepareRequirements(set: RequirementSet): RequirementsIntake {
  const constraints: HardConstraint[] = [];
  const preferences: WeightedPreference[] = [];
  const issues: RequirementIssue[] = [];
  const seenConstraintIds = new Set<string>();
  const seenPreferenceIds = new Set<string>();

  const rawConstraints: readonly unknown[] = Array.isArray(set.constraints)
    ? set.constraints
    : [];
  if (!Array.isArray(set.constraints)) {
    issues.push({
      kind: "invalid-constraint",
      constraintId: "<container>",
      detail: "constraints must be an array",
    });
  }
  for (const entry of rawConstraints) {
    if (!isObject(entry)) {
      issues.push({
        kind: "invalid-constraint",
        constraintId: "<missing>",
        detail: "constraint must be an object",
      });
      continue;
    }
    const constraint = entry as unknown as HardConstraint;
    const detail = constraintProblem(constraint);
    if (detail !== null) {
      issues.push({
        kind: "invalid-constraint",
        constraintId: isNonEmptyString(constraint.constraintId)
          ? constraint.constraintId
          : "<missing>",
        detail,
      });
      continue;
    }
    if (seenConstraintIds.has(constraint.constraintId)) {
      issues.push({
        kind: "duplicate-constraint-id",
        constraintId: constraint.constraintId,
      });
      continue;
    }
    seenConstraintIds.add(constraint.constraintId);
    constraints.push(constraint);
  }

  const rawPreferences: readonly unknown[] = Array.isArray(set.preferences)
    ? set.preferences
    : [];
  if (!Array.isArray(set.preferences)) {
    issues.push({
      kind: "invalid-preference",
      preferenceId: "<container>",
      detail: "preferences must be an array",
    });
  }
  for (const entry of rawPreferences) {
    if (!isObject(entry)) {
      issues.push({
        kind: "invalid-preference",
        preferenceId: "<missing>",
        detail: "preference must be an object",
      });
      continue;
    }
    const preference = entry as unknown as WeightedPreference;
    const detail = preferenceProblem(preference);
    if (detail !== null) {
      issues.push({
        kind: "invalid-preference",
        preferenceId: isNonEmptyString(preference.preferenceId)
          ? preference.preferenceId
          : "<missing>",
        detail,
      });
      continue;
    }
    if (seenPreferenceIds.has(preference.preferenceId)) {
      issues.push({
        kind: "duplicate-preference-id",
        preferenceId: preference.preferenceId,
      });
      continue;
    }
    seenPreferenceIds.add(preference.preferenceId);
    preferences.push(preference);
  }

  constraints.sort((a, b) => compareStrings(a.constraintId, b.constraintId));
  preferences.sort((a, b) => compareStrings(a.preferenceId, b.preferenceId));
  return { constraints, preferences, issues };
}

/** Sorted union of all metric ids referenced by the requirement set. */
export function requirementMetricIds(set: RequirementSet): readonly string[] {
  const ids = new Set<string>();
  const constraints: readonly HardConstraint[] = Array.isArray(set.constraints)
    ? set.constraints
    : [];
  const preferences: readonly WeightedPreference[] = Array.isArray(
    set.preferences,
  )
    ? set.preferences
    : [];
  for (const constraint of constraints) {
    ids.add(constraint.metricId);
  }
  for (const preference of preferences) {
    ids.add(preference.metricId);
  }
  return [...ids].sort(compareStrings);
}

export type ConstraintCheck =
  | {
      readonly status: "pass" | "fail";
      readonly constraintId: string;
      readonly metricId: string;
      readonly observed: number;
      readonly op: ComparisonOp;
      readonly bound: number;
    }
  | {
      readonly status: "metric-unavailable";
      readonly constraintId: string;
      readonly metricId: string;
    }
  | {
      readonly status: "unit-mismatch";
      readonly constraintId: string;
      readonly metricId: string;
      readonly constraintUnit: string;
      readonly readingUnit: string;
    };

/** Check one hard constraint against a subject's metric readings. */
export function checkHardConstraint(
  constraint: HardConstraint,
  readings: readonly MetricReading[],
): ConstraintCheck {
  const reading = findReading(readings, constraint.metricId);
  if (reading === undefined) {
    return {
      status: "metric-unavailable",
      constraintId: constraint.constraintId,
      metricId: constraint.metricId,
    };
  }
  if (reading.unit !== constraint.unit) {
    return {
      status: "unit-mismatch",
      constraintId: constraint.constraintId,
      metricId: constraint.metricId,
      constraintUnit: constraint.unit,
      readingUnit: reading.unit,
    };
  }
  const observed = reading.value;
  const passes =
    constraint.op === "<="
      ? observed <= constraint.bound
      : constraint.op === ">="
        ? observed >= constraint.bound
        : observed === constraint.bound;
  return {
    status: passes ? "pass" : "fail",
    constraintId: constraint.constraintId,
    metricId: constraint.metricId,
    observed,
    op: constraint.op,
    bound: constraint.bound,
  };
}

function constraintProblem(constraint: HardConstraint): string | null {
  if (!isNonEmptyString(constraint.constraintId)) {
    return "constraintId must be a non-empty string";
  }
  if (typeof constraint.kind !== "string" || !HARD_CONSTRAINT_KINDS.includes(constraint.kind)) {
    return `unknown kind "${String(constraint.kind)}"`;
  }
  if (!isNonEmptyString(constraint.description)) {
    return "description must be a non-empty string";
  }
  if (!isNonEmptyString(constraint.source)) {
    return "source must be a non-empty string (requirement provenance)";
  }
  if (!isNonEmptyString(constraint.metricId)) {
    return "metricId must be a non-empty string";
  }
  if (typeof constraint.op !== "string" || !COMPARISON_OPS.includes(constraint.op)) {
    return `unknown op "${String(constraint.op)}"`;
  }
  if (!isFiniteNumber(constraint.bound)) {
    return "bound must be a finite number";
  }
  if (!isNonEmptyString(constraint.unit)) {
    return "unit must be a non-empty string";
  }
  return null;
}

function preferenceProblem(preference: WeightedPreference): string | null {
  if (!isNonEmptyString(preference.preferenceId)) {
    return "preferenceId must be a non-empty string";
  }
  if (!isNonEmptyString(preference.description)) {
    return "description must be a non-empty string";
  }
  if (!isNonEmptyString(preference.metricId)) {
    return "metricId must be a non-empty string";
  }
  if (
    typeof preference.direction !== "string" ||
    !METRIC_DIRECTIONS.includes(preference.direction)
  ) {
    return `unknown direction "${String(preference.direction)}"`;
  }
  if (
    !isFiniteNumber(preference.weight) ||
    preference.weight <= 0
  ) {
    return "weight must be a finite number > 0";
  }
  return null;
}
