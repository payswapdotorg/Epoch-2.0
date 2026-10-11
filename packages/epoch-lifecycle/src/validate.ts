/**
 * Internal validation and freezing utilities shared by the machine, policy
 * validation, the canonical codec and the persistence binding. Error codes
 * come from the frozen errors.ts contract.
 */

import { LifecycleError } from "./errors.ts";
import { isLifecyclePhaseId } from "./phases.ts";
import { isLifecycleAnchorKind } from "./types.ts";
import type { LifecycleAnchor, LifecycleState, LifecycleTransition } from "./types.ts";

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

/** Deeply freeze arrays and plain objects; every produced state is immutable. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreeze(item);
      }
    } else {
      for (const key of Object.keys(value)) {
        deepFreeze((value as unknown as Record<string, unknown>)[key]);
      }
    }
  }
  return value;
}

export function assertAnchor(value: unknown): asserts value is LifecycleAnchor {
  if (!isPlainObject(value)) {
    throw new LifecycleError("invalid-anchor", "an anchor must be a plain object with kind and digest", {
      actual: typeof value,
    });
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
    throw new LifecycleError("invalid-anchor", "a lifecycle state must be a plain object carrying a digest anchor", {
      actual: typeof value,
    });
  }
  assertAnchor(value.anchor);
  if (!isNonEmptyString(value.policyId)) {
    throw new LifecycleError("invalid-policy", "a lifecycle state requires a non-empty policyId", {});
  }
  if (!isLifecyclePhaseId(value.phase)) {
    throw new LifecycleError("unknown-phase", `unknown lifecycle phase "${String(value.phase)}"`, { phase: value.phase });
  }
  if (!isSafeNat(value.step)) {
    throw new LifecycleError("step-mismatch", "state.step must be a non-negative safe integer", { step: value.step });
  }
  if (!isSafeNat(value.enteredPhaseAtStep) || value.enteredPhaseAtStep > value.step) {
    throw new LifecycleError("step-mismatch", "state.enteredPhaseAtStep must be a safe integer not later than step", {
      enteredPhaseAtStep: value.enteredPhaseAtStep,
      step: value.step,
    });
  }
  if (!Array.isArray(value.transitions)) {
    throw new LifecycleError("invalid-transition", "state.transitions must be an array", {});
  }
  if (!Array.isArray(value.events)) {
    throw new LifecycleError("invalid-event", "state.events must be an array", {});
  }
}

export function assertTransitionShape(value: unknown): asserts value is LifecycleTransition {
  if (!isPlainObject(value)) {
    throw new LifecycleError("invalid-transition", "a lifecycle transition must be a plain object", {
      actual: typeof value,
    });
  }
  if (!isLifecyclePhaseId(value.from) || !isLifecyclePhaseId(value.to)) {
    throw new LifecycleError("unknown-phase", "a transition references an unknown phase", {
      from: value.from,
      to: value.to,
    });
  }
  if (!isSafeNat(value.step) || value.step < 1) {
    throw new LifecycleError("step-mismatch", "a transition step must be a positive safe integer", { step: value.step });
  }
  if (typeof value.reason !== "string") {
    throw new LifecycleError("missing-reason", "a transition requires a string reason", { step: value.step });
  }
  if (!Array.isArray(value.evidence)) {
    throw new LifecycleError("invalid-evidence", "a transition requires an evidence array", { step: value.step });
  }
}
