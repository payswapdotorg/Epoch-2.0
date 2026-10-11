/** Typed error codes surfaced by the timeline authority. */
export type TimelineErrorCode =
  | "revision-entities-missing"
  | "revision-entities-invalid"
  | "revision-digest-invalid"
  | "entity-id-missing"
  | "entity-id-duplicate"
  | "entity-construction-malformed"
  | "phase-conflict"
  | "phase-unknown"
  | "day-invalid"
  | "position-invalid"
  | "model-invalid"
  | "model-digest-mismatch"
  | "revision-mismatch"
  | "serialization-invalid";

/**
 * The only error type thrown by this package. Corrupt or unknown phase data
 * surfaces as a typed error — never as a silent repair.
 */
export class TimelineError extends Error {
  readonly code: TimelineErrorCode;
  readonly details: Readonly<Record<string, string | number>>;

  constructor(
    code: TimelineErrorCode,
    message: string,
    details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = "TimelineError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

/** Type guard for `TimelineError`. */
export function isTimelineError(value: unknown): value is TimelineError {
  return value instanceof TimelineError;
}
