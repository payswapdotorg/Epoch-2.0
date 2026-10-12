/**
 * Canonical serialization + SHA-256 helpers for the Arena adapter.
 *
 * Laws honored here:
 * - Hash law: SHA-256 is ALWAYS computed via node:crypto
 *   `createHash("sha256")` — never hand-rolled.
 * - Canonical JSON: recursively key-sorted object keys, no
 *   insignificant whitespace, `undefined`-valued fields dropped,
 *   JSON-safe values only.
 * - Purity: no I/O, no clock, no randomness (no execution authority).
 */
import { createHash } from "node:crypto";

const ISO_8601_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

/** Deterministic canonical JSON: sorted keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  return serializeCanonical(value);
}

function serializeCanonical(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("non-finite numbers are not canonicalizable");
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map(serializeCanonical).join(",")}]`;
      }
      return serializeObject(value as Record<string, unknown>);
    default:
      throw new TypeError(
        `values of type ${typeof value} are not canonicalizable`,
      );
  }
}

function serializeObject(value: Record<string, unknown>): string {
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${serializeCanonical(v)}`);
  return `{${entries.join(",")}}`;
}

/** SHA-256 hex digest — node:crypto only, never hand-rolled. */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Canonical digest of an arbitrary JSON-safe value. */
export function digestOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** True for 64-character lowercase hex strings. */
export function isHex64(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 64 &&
    /^[0-9a-f]{64}$/.test(value)
  );
}

/** Deterministic short id: `<prefix>_<first 16 hex of digest>`. */
export function mintId(prefix: string, digest: string): string {
  return `${prefix}_${digest.slice(0, 16)}`;
}

/** Strict ISO-8601 UTC timestamp check (trailing `Z` only). */
export function isValidIso8601Utc(value: string): boolean {
  return ISO_8601_UTC_RE.test(value) && !Number.isNaN(Date.parse(value));
}
