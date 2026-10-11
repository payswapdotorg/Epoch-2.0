import { createHash } from "node:crypto";
import type { DigestHex, DigestRef } from "./contract";

const HEX64 = /^[0-9a-f]{64}$/;

/** True for 64-character lowercase hex strings only. */
export function isDigestHex(value: unknown): value is DigestHex {
  return typeof value === "string" && HEX64.test(value);
}

/** Structural guard for sha256 digest refs. */
export function isDigestRef(value: unknown): value is DigestRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { algorithm?: unknown; digest?: unknown };
  return candidate.algorithm === "sha256" && isDigestHex(candidate.digest);
}

/** sha256 hex digest via node:crypto (the hash law: never hand-rolled). */
export function sha256Hex(input: string): DigestHex {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Canonical JSON serialization: object keys sorted, no whitespace, array
 * order preserved, undefined object entries omitted, unstable values
 * (non-finite numbers, undefined, symbols, functions, bigints) rejected.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("canonicalJson: non-finite number");
      }
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "object":
      return Array.isArray(value)
        ? serializeArray(value)
        : serializeObject(value as Record<string, unknown>);
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value}`);
  }
}

function serializeArray(values: readonly unknown[]): string {
  const items = values.map((item) => {
    if (item === undefined) {
      throw new TypeError("canonicalJson: undefined inside array");
    }
    return serialize(item);
  });
  return `[${items.join(",")}]`;
}

function serializeObject(value: Record<string, unknown>): string {
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${serialize(value[key])}`,
  );
  return `{${entries.join(",")}}`;
}

/** Content-addressed digest ref over the canonical serialization. */
export function digestRefOf(value: unknown): DigestRef {
  return { algorithm: "sha256", digest: sha256Hex(canonicalJson(value)) };
}
