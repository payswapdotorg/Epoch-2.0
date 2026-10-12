import type {
  Digest,
  FormatId,
  KebabId,
  LicenseId,
  NonEmptyString,
  Semver,
  ToolId,
  UtcTimestamp,
} from "./types/brands.js";

const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ISO8601_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export function isNonEmptyString(value: unknown): value is NonEmptyString {
  return typeof value === "string" && value.length > 0;
}

export function isNonEmptyStringArray(value: unknown): value is readonly NonEmptyString[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((element: unknown): element is NonEmptyString => isNonEmptyString(element));
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function isKebabId(value: unknown): value is KebabId {
  return typeof value === "string" && KEBAB_ID_PATTERN.test(value);
}

export function isSemver(value: unknown): value is Semver {
  return typeof value === "string" && SEMVER_PATTERN.test(value);
}

export function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

export function isIso8601Utc(value: unknown): value is UtcTimestamp {
  return typeof value === "string" && ISO8601_UTC_PATTERN.test(value);
}

export function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort(compareStrings);
}

export function toNonEmptyString(value: string): NonEmptyString {
  if (!isNonEmptyString(value)) {
    throw new Error(`expected a non-empty string, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function toKebabId(value: string): KebabId {
  if (!isKebabId(value)) {
    throw new Error(`expected a kebab id, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function toNonNegativeInteger(value: number): number {
  if (!isNonNegativeInteger(value)) {
    throw new Error(`expected an integer >= 0, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function toPositiveInteger(value: number): number {
  if (!isPositiveInteger(value)) {
    throw new Error(`expected an integer >= 1, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function toSemver(value: string): Semver {
  if (!isSemver(value)) {
    throw new Error(`expected a semver x.y.z, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function toDigest(value: string): Digest {
  if (!isDigest(value)) {
    throw new Error(`expected a 64-char lowercase hex digest, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function toUtcTimestamp(value: string): UtcTimestamp {
  if (!isIso8601Utc(value)) {
    throw new Error(`expected an ISO-8601 UTC timestamp, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function toToolId(value: string): ToolId {
  if (!KEBAB_ID_PATTERN.test(value)) {
    throw new Error(`expected a kebab-case tool id, got: ${JSON.stringify(value)}`);
  }
  return value as ToolId;
}

export function toFormatId(value: string): FormatId {
  if (!KEBAB_ID_PATTERN.test(value)) {
    throw new Error(`expected a kebab-case format id, got: ${JSON.stringify(value)}`);
  }
  return value as FormatId;
}

export function toLicenseId(value: string): LicenseId {
  if (!KEBAB_ID_PATTERN.test(value)) {
    throw new Error(`expected a kebab-case license id, got: ${JSON.stringify(value)}`);
  }
  return value as LicenseId;
}
