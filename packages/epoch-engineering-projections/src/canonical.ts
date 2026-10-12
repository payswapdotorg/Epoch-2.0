import { createHash } from "node:crypto";
import type { Digest } from "./types/shared.js";

/**
 * Canonical serialization and digest helpers.
 *
 * Canonical JSON: recursively key-sorted, no whitespace. SHA-256 is provided
 * by node:crypto (`createHash("sha256")`) — it is never hand-rolled. Digests
 * are lowercase hex strings.
 */

/** JSON value shapes accepted by the canonical serializer. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Canonical JSON: recursively key-sorted, no whitespace. Deterministic. */
export function canonicalJson(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return serializeNumber(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const elements = value as readonly JsonValue[];
    return `[${elements.map((element) => canonicalJson(element)).join(",")}]`;
  }
  const record = value as { readonly [key: string]: JsonValue };
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry === undefined) {
      continue;
    }
    parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
  }
  return `{${parts.join(",")}}`;
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("canonicalJson: non-finite numbers are not representable");
  }
  return Object.is(value, -0) ? "0" : JSON.stringify(value);
}

/** SHA-256 of a string as a lowercase hex digest, via node:crypto. */
export function sha256Hex(input: string): Digest {
  return createHash("sha256").update(input, "utf8").digest("hex") as Digest;
}

/** SHA-256 digest of the canonical JSON form of a value. */
export function sha256Json(value: JsonValue): Digest {
  return sha256Hex(canonicalJson(value));
}
