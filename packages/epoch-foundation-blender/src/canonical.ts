import { createHash } from "node:crypto";
import type { Digest } from "./types/brands.js";

/**
 * Canonical JSON serialization: object keys are recursively sorted, no
 * whitespace is emitted, arrays keep their order. The output is a stable
 * input to SHA-256 digests. Never hand-roll hashing — always node:crypto.
 */
export function canonicalJson(value: unknown): string {
  return serializeValue(value, new Set<object>());
}

/** SHA-256 of a UTF-8 string as lowercase hex (64 chars). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 digest over the canonical JSON of a value. */
export function sha256Canonical(value: unknown): Digest {
  return sha256Hex(canonicalJson(value)) as Digest;
}

function serializeValue(value: unknown, ancestors: Set<object>): string {
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) {
        throw new Error("canonicalJson: numbers must be finite");
      }
      return JSON.stringify(value);
    }
    case "string":
      return JSON.stringify(value);
    case "object":
      if (value === null) {
        return "null";
      }
      return serializeObjectLike(value, ancestors);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
    default:
      throw new Error(`canonicalJson: unsupported value of type ${typeof value}`);
  }
}

function serializeObjectLike(value: object, ancestors: Set<object>): string {
  if (ancestors.has(value)) {
    throw new Error("canonicalJson: circular reference detected");
  }
  if (Array.isArray(value)) {
    ancestors.add(value);
    const items = value.map((element) => serializeValue(element, ancestors));
    ancestors.delete(value);
    return `[${items.join(",")}]`;
  }
  if (!isPlainObject(value)) {
    throw new Error("canonicalJson: only plain objects and arrays are canonicalizable");
  }
  ancestors.add(value);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const member = record[key];
    if (member === undefined) {
      throw new Error(
        `canonicalJson: property "${key}" is undefined; use null or omit the property`,
      );
    }
    parts.push(`${JSON.stringify(key)}:${serializeValue(member, ancestors)}`);
  }
  ancestors.delete(value);
  return `{${parts.join(",")}}`;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
