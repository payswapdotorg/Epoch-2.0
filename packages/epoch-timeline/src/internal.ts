/**
 * Shared internal helpers. Not part of the public surface.
 */
import { TimelineError, type TimelineErrorCode } from "./errors.js";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function firstOwn(
  record: Record<string, unknown>,
  keys: readonly string[],
): { key: string; value: unknown } | undefined {
  for (const key of keys) {
    if (hasOwn(record, key)) {
      return { key, value: record[key] };
    }
  }
  return undefined;
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const record = value as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      deepFreeze(record[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export function requireField(
  record: Record<string, unknown>,
  key: string,
  code: TimelineErrorCode,
  subject: string,
): unknown {
  if (!hasOwn(record, key)) {
    throw new TimelineError(code, `${subject} is missing required field "${key}"`, {
      field: key,
    });
  }
  return record[key];
}

export function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  code: TimelineErrorCode,
  subject: string,
): string {
  const value = requireField(record, key, code, subject);
  if (typeof value !== "string" || value.length === 0) {
    throw new TimelineError(code, `${subject} field "${key}" must be a non-empty string`, {
      field: key,
    });
  }
  return value;
}

export function requireFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  code: TimelineErrorCode,
  subject: string,
): number {
  const value = requireField(record, key, code, subject);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TimelineError(code, `${subject} field "${key}" must be a finite number`, {
      field: key,
    });
  }
  return value;
}

export function requireUnitNumber(
  record: Record<string, unknown>,
  key: string,
  code: TimelineErrorCode,
  subject: string,
): number {
  const value = requireFiniteNumber(record, key, code, subject);
  if (value < 0 || value > 1) {
    throw new TimelineError(code, `${subject} field "${key}" must be within [0, 1]`, {
      field: key,
    });
  }
  return value;
}

export function requireInteger(
  record: Record<string, unknown>,
  key: string,
  code: TimelineErrorCode,
  subject: string,
): number {
  const value = requireFiniteNumber(record, key, code, subject);
  if (!Number.isInteger(value)) {
    throw new TimelineError(code, `${subject} field "${key}" must be an integer`, {
      field: key,
    });
  }
  return value;
}

export function requireArray(
  record: Record<string, unknown>,
  key: string,
  code: TimelineErrorCode,
  subject: string,
): unknown[] {
  const value = requireField(record, key, code, subject);
  if (!Array.isArray(value)) {
    throw new TimelineError(code, `${subject} field "${key}" must be an array`, {
      field: key,
    });
  }
  return value;
}
