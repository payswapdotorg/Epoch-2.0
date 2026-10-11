/**
 * Internal validation and freezing utilities shared by the machine, the
 * canonical serializer, the parser and the persistence binding. Nothing here
 * is public API except the anchor/learning kind guards re-exported by the
 * package entrypoint.
 */

import { LifecycleError } from "./errors.ts";
import { isLifecyclePhaseId } from "./phases.ts";
import type { LearningOutcome, LifecycleAnchor, LifecycleAnchorKind, LifecycleState, LifecycleTransition } from "./index.ts";

export const LIFECYCLE_ANCHOR_KINDS: readonly LifecycleAnchorKind[] = ["solution", "revision", "surface"];
export const LEARNING_OUTCOMES: readonly LearningOutcome[] = ["as-planned", "deviation"];

export function isLifecycleAnchorKind(value: unknown): value is LifecycleAnchorKind {
  return typeof value === "string" && LIFECYCLE_ANCHOR_KINDS.includes(value as LifecycleAnchorKind);
}

export function isLearningOutcome(value: unknown): value is LearningOutcome {
  return typeof value === "string" && LEARNING_OUTCOMES.includes(value as LearningOutcome);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSafeNat(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Deeply freeze a value (arrays and plain objects recursively). All states,
 * events, transitions, snapshots and projections produced by this package
 * are frozen: prior evidence cannot be mutated after the fact.
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as unknown as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export function assertAnchor(value: unknown): asserts value is LifecycleAnchor {
  if (!isPlainObject(value)) {
    throw new LifecycleError("invalid-anchor", "an anchor must be a plain object with kind and digest", { actual: value });
  }
  if (!isLifecycleAnchorKind(value.kind)) {
    throw new LifecycleError("invalid-anchor", `unknown anchor kind "${String(value.kind)}"`, { kind: value.kind });
  }
  if (!isNonEmptyString(value.digest)) {
    throw new LifecycleError("invalid-anchor", "an anchor requires a non-empty digest", { kind: value.kind });
  }
}

export function assertStateShape(value: unknown): asserts value is LifecycleState {
  if (!isPlainObject(value)) {
    throw new LifecycleError("invalid-state", "a lifecycle state must be a plain object", { actual: value });
  }
  assertAnchor(value.anchor);
  if (!isNonEmptyString(value.policyId)) {
    throw new LifecycleError("invalid-state", "a lifecycle state requires a non-empty policyId", {});
  }
  if (!isLifecyclePhaseId(value.phase)) {
    throw new LifecycleError("invalid-state", `unknown phase "${String(value.phase)}"`, { phase: value.phase });
  }
  if (!isSafeNat(value.step)) {
    throw new LifecycleError("invalid-state", "state step must be a non-negative safe integer", { step: value.step });
  }
  if (!isSafeNat(value.enteredPhaseAtStep) || value.enteredPhaseAtStep > value.step) {
    throw new LifecycleError("invalid-state", "enteredPhaseAtStep must be a safe integer not later than step", {
      enteredPhaseAtStep: value.enteredPhaseAtStep,
      step: value.step,
    });
  }
  if (!Array.isArray(value.transitions) || !Array.isArray(value.events)) {
    throw new LifecycleError("invalid-state", "a lifecycle state requires transitions and events arrays", {});
  }
}

export function assertTransitionShape(value: unknown): asserts value is LifecycleTransition {
  if (!isPlainObject(value)) {
    throw new LifecycleError("invalid-transition", "a transition must be a plain object", { actual: value });
  }
  if (!isLifecyclePhaseId(value.from) || !isLifecyclePhaseId(value.to)) {
    throw new LifecycleError("invalid-transition", "a transition requires valid from/to phases", {
      from: value.from,
      to: value.to,
    });
  }
  if (!isSafeNat(value.step) || value.step < 1) {
    throw new LifecycleError("invalid-transition", "a transition step must be a positive safe integer", { step: value.step });
  }
  if (typeof value.reason !== "string") {
    throw new LifecycleError("invalid-transition", "a transition reason must be a string", { step: value.step });
  }
  if (!Array.isArray(value.evidence)) {
    throw new LifecycleError("invalid-transition", "transition evidence must be an array", { step: value.step });
  }
}
