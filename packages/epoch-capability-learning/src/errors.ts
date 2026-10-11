/**
 * Typed internal errors for `@zcode/epoch-capability-learning`.
 *
 * These are reserved for invariant violations (corrupt routing tables,
 * non-canonicalizable values, malformed reference data handed to throwing
 * constructors). All domain outcomes are discriminated unions, never
 * exceptions. No execution authority is exercised anywhere.
 */

export class CanonicalizationError extends Error {
  constructor(detail: string) {
    super(`canonicalization failure: ${detail}`);
    this.name = "CanonicalizationError";
  }
}

export class InvalidRecordError extends Error {
  constructor(detail: string) {
    super(`invalid record: ${detail}`);
    this.name = "InvalidRecordError";
  }
}

export class GapRoutingError extends Error {
  constructor(detail: string) {
    super(`gap routing failure: ${detail}`);
    this.name = "GapRoutingError";
  }
}
