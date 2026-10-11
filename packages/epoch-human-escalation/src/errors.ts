/**
 * Typed errors for the escalation machine. Illegal inputs (invalid policy,
 * policy-violating questions, malformed responses, missing provenance,
 * ungranted seams, corrupt persisted state) are typed errors, never silently
 * accepted data.
 */
export type EscalationErrorCode =
  | "policy-invalid"
  | "question-invalid"
  | "question-kind-not-allowed"
  | "rate-limit-exceeded"
  | "response-invalid"
  | "provenance-incomplete"
  | "grant-required"
  | "policy-mismatch"
  | "state-corrupt";

export interface EscalationErrorDetail {
  readonly field: string;
  readonly message: string;
}

export class EscalationError extends Error {
  readonly code: EscalationErrorCode;
  readonly details: readonly EscalationErrorDetail[];

  constructor(
    code: EscalationErrorCode,
    message: string,
    details: readonly EscalationErrorDetail[] = [],
  ) {
    super(`[${code}] ${message}`);
    this.name = "EscalationError";
    this.code = code;
    this.details = details;
  }
}
