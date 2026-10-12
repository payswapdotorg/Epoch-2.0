import { createHash } from "node:crypto";

/**
 * W035 hash law: SHA-256 is computed exclusively via node:crypto
 * createHash("sha256"). No hand-rolled hashing exists in this package.
 */

declare const sha256DigestBrand: unique symbol;

/** Branded lowercase-hex SHA-256 digest (64 characters). */
export type Sha256Digest = string & {
  readonly [sha256DigestBrand]: true;
};

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Shape guard for a lowercase-hex sha256 digest. */
export function isSha256Digest(value: string): value is Sha256Digest {
  return SHA256_HEX_PATTERN.test(value);
}

/** Validating constructor: throws on malformed digests. */
export function toSha256Digest(value: string): Sha256Digest {
  if (typeof value !== "string" || !SHA256_HEX_PATTERN.test(value)) {
    throw new TypeError(
      `toSha256Digest: lowercase hex sha256 digest expected, got: ${JSON.stringify(value)}`
    );
  }
  return value as Sha256Digest;
}

/** SHA-256 over the raw UTF-8 bytes of `input` (node:crypto, never hand-rolled). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Normalize a JSON-compatible value into canonical form:
 * - object keys are sorted recursively (code-unit order);
 * - `undefined` object properties are dropped; `undefined` array items and a
 *   top-level `undefined` become `null` (JSON semantics);
 * - non-finite numbers, bigints, symbols and functions are rejected.
 */
function normalize(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  const type = typeof value;
  if (type === "undefined") {
    return null;
  }
  if (type === "boolean" || type === "string") {
    return value;
  }
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonicalJson: non-finite numbers are not serializable");
    }
    return value;
  }
  if (type === "bigint" || type === "symbol" || type === "function") {
    throw new TypeError(`canonicalJson: unsupported value type: ${type}`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalize(item)));
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item === undefined) {
      continue;
    }
    out[key] = normalize(item);
  }
  return out;
}

function serialize(normalized: unknown): string {
  if (normalized === null) {
    return "null";
  }
  const type = typeof normalized;
  if (type === "boolean") {
    return normalized ? "true" : "false";
  }
  if (type === "number") {
    return JSON.stringify(normalized);
  }
  if (type === "string") {
    return JSON.stringify(normalized);
  }
  if (Array.isArray(normalized)) {
    return `[${normalized.map((item) => serialize(item)).join(",")}]`;
  }
  if (type === "object") {
    const entries = Object.entries(normalized as Record<string, unknown>).map(
      ([key, val]) => `${JSON.stringify(key)}:${serialize(val)}`
    );
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported normalized type: ${type}`);
}

/** Deterministic JSON serialization (recursively sorted keys, stable scalars). */
export function canonicalJson(value: unknown): string {
  return serialize(normalize(value));
}

/** SHA-256 (node:crypto) over the canonical JSON serialization of `value`. */
export function digestCanonical(value: unknown): Sha256Digest {
  return toSha256Digest(sha256Hex(canonicalJson(value)));
}
