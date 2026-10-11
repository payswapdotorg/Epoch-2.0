/**
 * Canonical JSON serialization and content digests.
 *
 * Determinism law (invariant 17): identical event sequences produce
 * byte-identical canonical serializations and digests. To guarantee that:
 *  - object keys are emitted in UTF-16 code-unit order, independent of
 *    insertion order;
 *  - arrays keep their order;
 *  - numbers and strings are rendered by the ECMAScript-specified JSON rules
 *    (note: -0 and 0 both render as "0", which is the JSON semantics);
 *  - only plain JSON data is accepted (no undefined, functions, symbols,
 *    bigint, non-finite numbers, Dates, class instances, symbol keys,
 *    non-enumerable own keys, or cycles).
 */

import { sha256Hex } from "./sha256.js";

export type CanonicalPrimitive = null | boolean | number | string;
export type CanonicalValue =
  | CanonicalPrimitive
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export const DIGEST_PREFIX = "sha256:";
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function isDigestString(value: string): boolean {
  return DIGEST_PATTERN.test(value);
}

export function assertDigestString(value: string, what: string): void {
  if (!isDigestString(value)) {
    throw new Error(
      `${what}: expected a \`sha256:<64 lowercase hex>\` digest, got: ${String(value)}`,
    );
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkCanonical(value: unknown, seen: Set<object>): boolean {
  if (value === null) {
    return true;
  }
  const type = typeof value;
  if (type === "boolean") {
    return true;
  }
  if (type === "number") {
    return Number.isFinite(value);
  }
  if (type === "string") {
    return true;
  }
  if (type !== "object") {
    return false; // undefined, symbol, function, bigint
  }
  if (seen.has(value as object)) {
    return false; // cycle
  }
  if (Array.isArray(value)) {
    seen.add(value as object);
    for (const item of value) {
      if (!checkCanonical(item, seen)) {
        return false;
      }
    }
    seen.delete(value as object);
    return true;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false; // class instances, Dates, Maps, ...
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
    return false; // non-enumerable own string properties would be dropped silently
  }
  seen.add(value as object);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!checkCanonical(record[key], seen)) {
      return false;
    }
  }
  seen.delete(value as object);
  return true;
}

export function isCanonicalValue(value: unknown): value is CanonicalValue {
  return checkCanonical(value, new Set());
}

function serialize(value: CanonicalValue, seen: Set<object>): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalJson: non-finite numbers are not serializable");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value as object)) {
      throw new Error("canonicalJson: cycle detected");
    }
    seen.add(value as object);
    const parts = value.map((item) => serialize(item, seen));
    seen.delete(value as object);
    return `[${parts.join(",")}]`;
  }
  if (seen.has(value as object)) {
    throw new Error("canonicalJson: cycle detected");
  }
  seen.add(value as object);
  const record = value as Record<string, CanonicalValue>;
  const keys = Object.keys(record).sort(); // UTF-16 code-unit order, spec-stable
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(`${JSON.stringify(key)}:${serialize(record[key], seen)}`);
  }
  seen.delete(value as object);
  return `{${parts.join(",")}}`;
}

export function canonicalJson(value: CanonicalValue): string {
  return serialize(value, new Set());
}

export function canonicalDigest(value: CanonicalValue): string {
  return DIGEST_PREFIX + sha256Hex(canonicalJson(value));
}

/** Digest an arbitrary record after verifying it is plain JSON data. */
export function digestRecord(record: unknown): string {
  if (!isCanonicalValue(record)) {
    throw new Error(
      "digestRecord: value is not canonical JSON data (cycles, undefined, " +
        "symbols, bigint, non-finite numbers, class instances and Dates are rejected)",
    );
  }
  return canonicalDigest(record);
}

/** Runtime-checked cast used at store boundaries (put/get). */
export function toStoreRecord(value: object): CanonicalValue {
  if (!isCanonicalValue(value)) {
    throw new Error("toStoreRecord: value is not canonical JSON data");
  }
  return value as CanonicalValue;
}
