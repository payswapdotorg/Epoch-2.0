import { sha256Hex } from "./sha256.js";

/**
 * Canonical JSON serialization: object keys sorted lexicographically, arrays
 * order-preserving, undefined-valued object keys omitted, non-data values
 * (functions, symbols, undefined array slots, non-finite numbers, Date/Map/
 * Set/RegExp) rejected. Identical data always yields a byte-identical string.
 */
export function canonicalJSON(value: unknown): string {
  const chunks: string[] = [];
  writeCanonical(value, chunks, 0);
  return chunks.join("");
}

function writeCanonical(value: unknown, chunks: string[], depth: number): void {
  if (depth > 256) {
    throw new Error("canonicalJSON: structure is nested too deeply");
  }
  if (value === null) {
    chunks.push("null");
    return;
  }
  const type = typeof value;
  if (type === "boolean") {
    chunks.push(value ? "true" : "false");
    return;
  }
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalJSON: non-finite numbers cannot be serialized");
    }
    chunks.push(JSON.stringify(value));
    return;
  }
  if (type === "string") {
    chunks.push(JSON.stringify(value));
    return;
  }
  if (type !== "object") {
    throw new Error(
      `canonicalJSON: values of type ${type} cannot be serialized`,
    );
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record)) {
    chunks.push("[");
    for (let i = 0; i < record.length; i++) {
      if (i > 0) chunks.push(",");
      if (record[i] === undefined) {
        throw new Error("canonicalJSON: arrays must not contain undefined");
      }
      writeCanonical(record[i], chunks, depth + 1);
    }
    chunks.push("]");
    return;
  }
  if (
    record instanceof Date ||
    record instanceof Map ||
    record instanceof Set ||
    record instanceof RegExp
  ) {
    throw new Error(
      "canonicalJSON: only plain data can be serialized (no Date/Map/Set/RegExp)",
    );
  }
  // Keys come from Object.keys() and are sorted before iteration, so a
  // `for...of` walk needs no index arithmetic. Under noUncheckedIndexedAccess
  // `keys[i]` is `string | undefined` (TS2538 as an index type); iterating
  // the sorted array directly keeps every key provably defined.
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  chunks.push("{");
  let first = true;
  for (const key of keys) {
    if (!first) chunks.push(",");
    first = false;
    chunks.push(JSON.stringify(key), ":");
    writeCanonical(record[key], chunks, depth + 1);
  }
  chunks.push("}");
}

/** SHA-256 hex digest of the canonical serialization of `value`. */
export function canonicalDigest(value: unknown): string {
  return sha256Hex(canonicalJSON(value));
}

/** Recursively freezes plain data (values are left untouched). */
export function deepFreeze<T>(value: T): T {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function")
  ) {
    for (const key of Object.getOwnPropertyNames(
      value as Record<string, unknown>,
    )) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
