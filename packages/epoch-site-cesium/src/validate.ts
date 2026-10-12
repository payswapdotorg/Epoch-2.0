import { SUPPORTED_EPSG_CODES } from "./types/site.js";

const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ISO8601_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isKebabId(value: unknown): value is string {
  return typeof value === "string" && KEBAB_ID_PATTERN.test(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO8601_TIMESTAMP_PATTERN.test(value);
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function isSupportedEpsgCode(value: unknown): value is number {
  return typeof value === "number" && (SUPPORTED_EPSG_CODES as readonly number[]).includes(value);
}
