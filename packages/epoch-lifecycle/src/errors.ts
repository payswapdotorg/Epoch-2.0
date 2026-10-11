/**
 * Typed errors for the universal engineering lifecycle.
 *
 * Every rejection carries a machine-readable `code`. The machine never
 * silently corrects illegal input — it throws.
 */

export type LifecycleErrorCode =
  | "unknown-phase"
  | "invalid-policy"
  | "policy-mismatch"
  | "invalid-state"
  | "invalid-anchor"
  | "invalid-digest"
  | "invalid-transition"
  | "phase-mismatch"
  | "step-mismatch"
  | "missing-reason"
  | "missing-evidence"
  | "invalid-evidence"
  | "illegal-edge"
  | "invalid-event"
  | "event-phase-mismatch"
  | "serialization"
  | "snapshot-not-found"
  | "digest-mismatch"
  | "persistence-binding";

export interface LifecycleErrorDetails {
  readonly [key: string]: unknown;
}

export class LifecycleError extends Error {
  readonly code: LifecycleErrorCode;
  readonly details: LifecycleErrorDetails;

  constructor(code: LifecycleErrorCode, message: string, details: LifecycleErrorDetails = {}) {
    super(message);
    this.name = "LifecycleError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function isLifecycleError(value: unknown): value is LifecycleError {
  return value instanceof LifecycleError;
}
