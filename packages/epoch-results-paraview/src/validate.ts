import type { DigestRef } from "./types/dataset.js";

/** unknown is a non-array, non-null object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** unknown is a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** unknown is an array of non-empty strings. */
export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((element) => isNonEmptyString(element));
}

/** unknown is an integer >= 0. */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** unknown is an integer > 0. */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** unknown is a finite number. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** unknown is a kebab-id: ^[a-z0-9]+(-[a-z0-9]+)*$ */
export function isKebabId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

/** unknown is a 64-character lowercase hex sha256 digest. */
export function isDigestHex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Membership type guard over a readonly string tuple. */
export function isMemberOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** unknown is a typed digest reference to an owning package's artifact. */
export function isDigestRef(value: unknown): value is DigestRef {
  return (
    isRecord(value) &&
    isKebabId(value.ownerPackage) &&
    isKebabId(value.artifactKind) &&
    isDigestHex(value.digest)
  );
}
