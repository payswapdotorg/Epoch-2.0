import { createHash } from "node:crypto";

import { CanonicalizationError } from "./errors.js";

/**
 * Canonical serialization + hashing utilities (hash law, W032 §7).
 *
 * Every record identity in this package is a SHA-256 digest computed over
 * `canonicalJson` output. SHA-256 always comes from `node:crypto`
 * `createHash("sha256")` — it is never hand-rolled. Digests are
 * domain-separated so records from this module can never collide with
 * records from other modules by construction.
 */

const DIGEST_DOMAIN = "zcode/epoch-capability-learning/v1";
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/** SHA-256 of `text` as lowercase hex, via node:crypto (hash law). */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Deterministic JSON serialization: object keys sorted lexicographically
 * (UTF-16 code unit order), no whitespace, `undefined` properties skipped.
 * Non-finite numbers, symbols, functions and bigints are rejected.
 */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(`non-finite number: ${String(value)}`);
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((element) => canonicalize(element)).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      const body = keys
        .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
        .join(",");
      return `{${body}}`;
    }
    default:
      throw new CanonicalizationError(`unsupported value type: ${typeof value}`);
  }
}

/** Domain-separated digest over the canonical serialization of `value`. */
export function digestRecord(domain: string, value: unknown): string {
  return sha256Hex(
    `${DIGEST_DOMAIN}\u0000${domain}\u0000${canonicalJson(value)}`,
  );
}

/** Whether `value` looks like a lowercase 64-hex SHA-256 digest. */
export function isValidDigest(value: string): boolean {
  return DIGEST_PATTERN.test(value);
}
