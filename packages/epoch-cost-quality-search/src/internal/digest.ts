import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical.js";

/**
 * Hash law (W033): every digest in this package is SHA-256 computed through
 * `node:crypto`'s `createHash("sha256")`. Hand-rolled hashing is forbidden.
 */

/** SHA-256 of a UTF-8 string, as lowercase hex. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 over the canonical JSON serialization of `value`. */
export function canonicalDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Whether `value` looks like a lowercase hex SHA-256 digest. */
export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}
