/**
 * Compile-time brands for the agent-presence package.
 *
 * Brands are type-level only; runtime validation lives in src/validate.ts and
 * in the builders under src/build/. Records are constructed exclusively
 * through those builders (or projected by machines), so branded fields are
 * always validated before they exist.
 */

declare const __epochAgentPresenceBrand: unique symbol;

/** Brand a primitive T with a compile-time tag B. */
export type Branded<T, B extends string> = T & {
  readonly [__epochAgentPresenceBrand]: B;
};

/** Lowercase hex SHA-256 digest (64 characters). */
export type Hex64 = Branded<string, "Hex64">;

/** Digest of an agent-tools agent record (the agent identity authority). */
export type AgentRecordDigest = Branded<string, "AgentRecordDigest">;

/** Digest of an agent-tools task record. */
export type TaskRecordDigest = Branded<string, "TaskRecordDigest">;

/** Digest of an environment-activity record. */
export type ActivityRecordDigest = Branded<string, "ActivityRecordDigest">;

/** Digest of a world-model entity record. */
export type WorldModelEntityDigest = Branded<string, "WorldModelEntityDigest">;

/** A non-empty string. */
export type NonEmptyString = Branded<string, "NonEmptyString">;

/** A kebab-case identifier. */
export type KebabId = Branded<string, "KebabId">;

/** A non-negative integer epoch timestamp in milliseconds. */
export type EpochMillis = Branded<number, "EpochMillis">;

/** A non-negative integer. */
export type NonNegativeInteger = Branded<number, "NonNegativeInteger">;
