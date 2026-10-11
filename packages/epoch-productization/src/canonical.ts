import { createHash } from "node:crypto";

/**
 * Deterministic canonical serialization and hashing primitives.
 *
 * Package law: never hand-roll SHA-256 — every digest in this package is
 * produced by node:crypto `createHash("sha256")`.
 *
 * Canonical form:
 * - Plain JSON values only: null, boolean, number, string, array, plain
 *   object. Functions, symbols, bigints, class instances, Maps, Sets,
 *   Dates, RegExps, non-finite numbers and cyclic structures throw
 *   `CanonicalizationError`.
 * - Object keys are sorted by UTF-16 code-unit order; no whitespace.
 * - `undefined` object members are dropped; `undefined` array items
 *   serialize as `null` (matching JSON.stringify semantics).
 */

export class CanonicalizationError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`cannot canonicalize ${path}: ${reason}`);
    this.name = "CanonicalizationError";
    this.path = path;
    this.reason = reason;
  }
}

export function canonicalJson(value: unknown): string {
  return writeValue(value, "$", []);
}

/** SHA-256 hex digest over UTF-8 text or raw bytes (node:crypto only). */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Canonical-form digest: sha256Hex(canonicalJson(value)). */
export function digestCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

const HEX64 = /^[0-9a-f]{64}$/;

export function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64.test(value);
}

/** Deterministic string ordering by UTF-16 code units (no locale). */
export function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function writeValue(value: unknown, path: string, ancestors: unknown[]): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return writeNumber(value, path);
    case "string":
      return JSON.stringify(value);
    case "object":
      return writeObject(value, path, ancestors);
    default:
      throw new CanonicalizationError(
        path,
        `unsupported value of type ${typeof value}`,
      );
  }
}

function writeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(path, "numbers must be finite");
  }
  return JSON.stringify(value);
}

function writeObject(value: object, path: string, ancestors: unknown[]): string {
  if (Array.isArray(value)) {
    if (ancestors.includes(value)) {
      throw new CanonicalizationError(path, "cyclic array");
    }
    const descendants = [...ancestors, value];
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      const rendered =
        item === undefined
          ? "null"
          : writeValue(item, `${path}[${index}]`, descendants);
      items.push(rendered);
    }
    return `[${items.join(",")}]`;
  }
  const constructorName = value.constructor?.name ?? "Object";
  if (constructorName !== "Object") {
    throw new CanonicalizationError(
      path,
      `only plain objects are canonicalizable (saw ${constructorName})`,
    );
  }
  if (ancestors.includes(value)) {
    throw new CanonicalizationError(path, "cyclic object");
  }
  const record = value as Record<string, unknown>;
  const descendants = [...ancestors, value];
  const parts: string[] = [];
  for (const key of Object.keys(record).sort(compareStrings)) {
    const member: unknown = record[key];
    if (member === undefined) {
      continue;
    }
    parts.push(
      `${JSON.stringify(key)}:${writeValue(member, `${path}.${key}`, descendants)}`,
    );
  }
  return `{${parts.join(",")}}`;
}
