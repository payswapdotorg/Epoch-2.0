import { createHash } from "node:crypto";
import type { Sha256Hex } from "./types/branded.js";

/**
 * Values that canonical JSON can serialize. Object keys are sorted
 * recursively; no whitespace is emitted; non-finite numbers map to null.
 */
export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

/** Canonical JSON: recursively sorted keys, no whitespace. */
export function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return Number.isFinite(value) ? JSON.stringify(value) : "null";
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((element) => canonicalJson(element)).join(",")}]`;
      }
      const record = value as { readonly [key: string]: CanonicalJsonValue };
      const keys = Object.keys(record).sort();
      const members = keys.map(
        (key) => `${JSON.stringify(key)}:${canonicalJson(record[key] ?? null)}`,
      );
      return `{${members.join(",")}}`;
    }
    default:
      return "null";
  }
}

/** Lowercase hex sha256 of a UTF-8 string, via node:crypto (never hand-rolled). */
export function sha256Hex(text: string): Sha256Hex {
  return createHash("sha256").update(text, "utf8").digest("hex") as Sha256Hex;
}

/** sha256 over the canonical JSON of a value. */
export function canonicalDigest(value: CanonicalJsonValue): Sha256Hex {
  return sha256Hex(canonicalJson(value));
}
