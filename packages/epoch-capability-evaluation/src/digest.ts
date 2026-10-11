// Canonical serialization + SHA-256 digests.
// Law: hashing MUST go through node:crypto createHash("sha256"); never hand-rolled.

import { createHash } from "node:crypto";

export const DIGEST_HEX_LENGTH = 64;

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Deterministic canonical JSON: object keys sorted lexicographically, no whitespace,
 * stable number rendering, undefined-valued object keys skipped. Arrays containing
 * undefined and non-finite numbers are rejected (strict determinism).
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      return serializeObject(value);
    default:
      throw new Error(`canonical-json/unsupported-type:${typeof value}`);
  }
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("canonical-json/non-finite-number");
  }
  if (Object.is(value, -0)) {
    return "0";
  }
  return String(value);
}

function serializeObject(value: object): string {
  if (Array.isArray(value)) {
    return `[${value.map((element) => serialize(element)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  if (keys.length === 0) {
    return "{}";
  }
  const entries = keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`);
  return `{${entries.join(",")}}`;
}

/** SHA-256 hex digest of a UTF-8 string, via node:crypto only. */
export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** SHA-256 hex digest over the canonical serialization of a plain-data value. */
export function digestOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** Structural check for lowercase hex SHA-256 digests. */
export function isSha256Digest(value: string): boolean {
  return typeof value === "string" && DIGEST_PATTERN.test(value) && value.length === DIGEST_HEX_LENGTH;
}
