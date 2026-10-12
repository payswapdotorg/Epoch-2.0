import type { EntityDigest, KebabId } from "./shared.js";
import type { MeasureKind } from "./quantity.js";

/**
 * Constraint types: typed constraints (clearance, capacity, code references)
 * bound to canonical entity digests, plus the typed verdicts produced by the
 * validateConstraints machine.
 */

/** A typed requirement over one measure kind. */
export interface ConstraintRequirement {
  readonly measureKind: MeasureKind;
  /** Finite, non-negative required value in the canonical unit. */
  readonly value: number;
}

/** Constraint kinds — typed data, bound to an entity digest. */
export type ConstraintKind =
  | { readonly kind: "clearance"; readonly requiredLengthM: number }
  | { readonly kind: "capacity"; readonly requirement: ConstraintRequirement }
  | { readonly kind: "code-reference"; readonly code: string; readonly clause?: string };

/** A constraint record bound to a canonical entity digest. */
export interface ConstraintRecord {
  readonly constraintId: KebabId;
  readonly entityDigest: EntityDigest;
  readonly kind: ConstraintKind;
  readonly note?: string;
}

/** Raw (unbranded) input for the buildConstraint machine. */
export interface ConstraintInput {
  readonly constraintId: string;
  readonly entityDigest: string;
  readonly kind: ConstraintKind;
  readonly note?: string;
}

/** Typed rejections of the buildConstraint machine. */
export type ConstraintRejection =
  | { readonly kind: "invalid-constraint-id"; readonly constraintId: string }
  | { readonly kind: "invalid-entity-digest"; readonly entityDigest: string }
  | { readonly kind: "invalid-note"; readonly note: string }
  | { readonly kind: "invalid-kind"; readonly reason: string };

/** Outcome of evaluating one constraint. */
export type ConstraintOutcome = "pass" | "fail" | "not-evaluable";

/** Typed verdict for one evaluated constraint. */
export interface ConstraintVerdict {
  readonly constraintId: KebabId;
  readonly entityDigest: EntityDigest;
  readonly outcome: ConstraintOutcome;
  readonly reason: string;
  /** Present for clearance/capacity; absent for code-reference. */
  readonly requirement?: ConstraintRequirement;
  /** Smallest matching measured value, present when at least one match exists. */
  readonly minMeasured?: number;
  readonly evidenceTakeoffIds: readonly KebabId[];
}

/** Typed rejections of the validateConstraints machine. */
export type ValidateConstraintsRejection =
  | { readonly kind: "duplicate-constraint-id"; readonly constraintId: string }
  | { readonly kind: "duplicate-takeoff-id"; readonly takeoffId: string };
