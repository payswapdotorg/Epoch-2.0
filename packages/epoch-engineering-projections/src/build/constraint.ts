import type { EntityDigest, Result } from "../types/shared.js";
import { UNIT_FOR_MEASURE_KIND } from "../types/quantity.js";
import type { QuantityTakeoff } from "../types/quantity.js";
import {
  isDigest,
  isKebabId,
  isMeasureKind,
  isNonEmptyString,
  isNonNegativeFiniteNumber,
  ok,
  reject,
} from "../validate.js";
import type {
  ConstraintInput,
  ConstraintKind,
  ConstraintRecord,
  ConstraintRejection,
  ConstraintRequirement,
  ConstraintVerdict,
  ValidateConstraintsRejection,
} from "../types/constraint.js";

type ConstraintResult = Result<ConstraintRecord, ConstraintRejection>;
type ValidateResult = Result<readonly ConstraintVerdict[], ValidateConstraintsRejection>;

/** Deterministic machine building a typed constraint bound to an entity digest. */
export function buildConstraint(input: ConstraintInput): ConstraintResult {
  if (!isKebabId(input.constraintId)) {
    return reject({ kind: "invalid-constraint-id", constraintId: input.constraintId });
  }
  if (!isDigest(input.entityDigest)) {
    return reject({ kind: "invalid-entity-digest", entityDigest: input.entityDigest });
  }
  if (input.note !== undefined && !isNonEmptyString(input.note)) {
    return reject({ kind: "invalid-note", note: input.note });
  }
  const kindError = validateKind(input.kind);
  if (kindError !== undefined) {
    return reject({ kind: "invalid-kind", reason: kindError });
  }
  return ok({
    constraintId: input.constraintId,
    entityDigest: input.entityDigest as unknown as EntityDigest,
    kind: input.kind,
    note: input.note,
  });
}

function validateKind(kind: ConstraintKind): string | undefined {
  switch (kind.kind) {
    case "clearance":
      if (!isNonNegativeFiniteNumber(kind.requiredLengthM)) {
        return "clearance requiredLengthM must be finite and non-negative";
      }
      return undefined;
    case "capacity":
      if (!isMeasureKind(kind.requirement.measureKind)) {
        return `capacity requirement measureKind is not declared: ${String(kind.requirement.measureKind)}`;
      }
      if (!isNonNegativeFiniteNumber(kind.requirement.value)) {
        return "capacity requirement value must be finite and non-negative";
      }
      return undefined;
    case "code-reference":
      if (!isNonEmptyString(kind.code)) {
        return "code-reference code must be a non-empty string";
      }
      if (kind.clause !== undefined && !isNonEmptyString(kind.clause)) {
        return "code-reference clause must be a non-empty string when present";
      }
      return undefined;
    default: {
      const exhaustive: never = kind;
      return `unreachable constraint kind: ${JSON.stringify(exhaustive)}`;
    }
  }
}

/**
 * Deterministic machine evaluating constraints against quantity takeoffs.
 * Verdicts: pass / fail (bounds, smallest matching measured value) or
 * not-evaluable (no matching takeoff, or a code-reference record).
 */
export function validateConstraints(
  constraints: readonly ConstraintRecord[],
  takeoffs: readonly QuantityTakeoff[],
): ValidateResult {
  const constraintIds = new Set<string>();
  for (const constraint of constraints) {
    if (constraintIds.has(constraint.constraintId)) {
      return reject({ kind: "duplicate-constraint-id", constraintId: constraint.constraintId });
    }
    constraintIds.add(constraint.constraintId);
  }
  const takeoffIds = new Set<string>();
  for (const takeoff of takeoffs) {
    if (takeoffIds.has(takeoff.takeoffId)) {
      return reject({ kind: "duplicate-takeoff-id", takeoffId: takeoff.takeoffId });
    }
    takeoffIds.add(takeoff.takeoffId);
  }
  return ok(constraints.map((constraint) => evaluateConstraint(constraint, takeoffs)));
}

function evaluateConstraint(
  constraint: ConstraintRecord,
  takeoffs: readonly QuantityTakeoff[],
): ConstraintVerdict {
  if (constraint.kind.kind === "code-reference") {
    return {
      constraintId: constraint.constraintId,
      entityDigest: constraint.entityDigest,
      outcome: "not-evaluable",
      reason:
        "code-compliance checking is out of scope; code-reference constraints are records only",
      evidenceTakeoffIds: [],
    };
  }
  const requirement: ConstraintRequirement =
    constraint.kind.kind === "clearance"
      ? { measureKind: "length", value: constraint.kind.requiredLengthM }
      : constraint.kind.requirement;
  const matching = takeoffs.filter(
    (takeoff) =>
      takeoff.entityDigest === constraint.entityDigest &&
      takeoff.quantity.measureKind === requirement.measureKind,
  );
  if (matching.length === 0) {
    return {
      constraintId: constraint.constraintId,
      entityDigest: constraint.entityDigest,
      outcome: "not-evaluable",
      reason: `no takeoff records for this entity with measure kind ${requirement.measureKind}`,
      requirement,
      evidenceTakeoffIds: [],
    };
  }
  const measured = matching.map((takeoff) => takeoff.quantity.value);
  const minMeasured = Math.min(...measured);
  const unit = UNIT_FOR_MEASURE_KIND[requirement.measureKind];
  const outcome = minMeasured >= requirement.value ? "pass" : "fail";
  const reason =
    outcome === "pass"
      ? `minimum measured ${requirement.measureKind} ${minMeasured} ${unit} meets the required ${requirement.value} ${unit}`
      : `minimum measured ${requirement.measureKind} ${minMeasured} ${unit} is below the required ${requirement.value} ${unit}`;
  return {
    constraintId: constraint.constraintId,
    entityDigest: constraint.entityDigest,
    outcome,
    reason,
    requirement,
    minMeasured,
    evidenceTakeoffIds: matching.map((takeoff) => takeoff.takeoffId),
  };
}
