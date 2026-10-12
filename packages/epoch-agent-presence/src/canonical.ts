import { createHash } from "node:crypto";

/**
 * Canonical JSON values: the shapes canonicalJson accepts. Records are
 * treated as unordered (keys are sorted recursively); arrays keep their order.
 */
export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

/** Canonical JSON encoding: recursively key-sorted, no whitespace. */
export function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError("canonicalJson: numbers must be finite (no NaN or Infinity)");
      }
      return JSON.stringify(value);
    }
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        const items = value as readonly CanonicalJsonValue[];
        return `[${items.map((item) => canonicalJson(item)).join(",")}]`;
      }
      const record = value as { readonly [key: string]: CanonicalJsonValue };
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const member: CanonicalJsonValue | undefined = record[key];
        if (member === undefined) {
          throw new TypeError(`canonicalJson: property ${JSON.stringify(key)} is undefined`);
        }
        parts.push(`${JSON.stringify(key)}:${canonicalJson(member)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported value type "${typeof value}"`);
  }
}

/** Lowercase SHA-256 hex digest of a UTF-8 string. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Lowercase SHA-256 hex digest of the canonical JSON encoding of a value. */
export function canonicalSha256(value: CanonicalJsonValue): string {
  return sha256Hex(canonicalJson(value));
}
