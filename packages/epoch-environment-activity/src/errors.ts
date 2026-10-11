/**
 * Shared domain errors for @zcode/epoch-environment-activity.
 * All errors extend EpochActivityError so hosts can catch the family.
 */

export class EpochActivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpochActivityError";
  }
}

export class InvalidRecordError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRecordError";
  }
}

export class InvalidCoverageError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCoverageError";
  }
}

export class InvalidPolicyError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPolicyError";
  }
}

export class ConsentError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "ConsentError";
  }
}

export class PolicyViolationError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

export class InvalidEpisodeError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEpisodeError";
  }
}

export class InvalidDemonstrationError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDemonstrationError";
  }
}

/** Thrown when a complete-sequence claim is attempted over incomplete coverage. */
export class IncompleteSequenceError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteSequenceError";
  }
}

export class InvalidCandidateError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCandidateError";
  }
}

export class PersistenceBindingError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceBindingError";
  }
}
