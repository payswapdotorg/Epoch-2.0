import type { CurrencyCode, Digest, Iso8601, KebabId } from "./types/shared.js";
import { MEASURE_KINDS, UNITS_OF_MEASURE } from "./types/quantity.js";
import type { MeasureKind, UnitOfMeasure } from "./types/quantity.js";
import { FINDING_SEVERITIES, FINDING_STATUSES } from "./types/finding.js";
import type { FindingSeverity, FindingStatus } from "./types/finding.js";

/**
 * Shared validators (type guards) and small result/comparison helpers used
 * by the deterministic machines in src/build/*.ts.
 */

const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ISO8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isKebabId(value: unknown): value is KebabId {
  return typeof value === "string" && KEBAB_ID_PATTERN.test(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isIso8601(value: unknown): value is Iso8601 {
  return typeof value === "string" && ISO8601_PATTERN.test(value);
}

export function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CURRENCY_CODE_PATTERN.test(value);
}

export function isMeasureKind(value: unknown): value is MeasureKind {
  return typeof value === "string" && (MEASURE_KINDS as readonly string[]).includes(value);
}

export function isUnitOfMeasure(value: unknown): value is UnitOfMeasure {
  return typeof value === "string" && (UNITS_OF_MEASURE as readonly string[]).includes(value);
}

export function isFindingSeverity(value: unknown): value is FindingSeverity {
  return typeof value === "string" && (FINDING_SEVERITIES as readonly string[]).includes(value);
}

export function isFindingStatus(value: unknown): value is FindingStatus {
  return typeof value === "string" && (FINDING_STATUSES as readonly string[]).includes(value);
}

/** Guard for quantity/takeoff values: finite and non-negative. */
export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Deterministic code-unit string comparison (never locale-aware). */
export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Builds a success result. */
export function ok<V>(value: V): { readonly ok: true; readonly value: V } {
  return { ok: true, value };
}

/** Builds a typed rejection result. */
export function reject<R>(rejection: R): { readonly ok: false; readonly rejection: R } {
  return { ok: false, rejection };
}
