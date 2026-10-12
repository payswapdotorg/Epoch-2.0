/**
 * Runtime guards for intake validation (internal).
 *
 * Public machines accept TypeScript-typed data, but intake validators still
 * verify shapes so that malformed records are excluded with typed issues
 * instead of throwing or being silently accepted.
 */

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((element) => isNonEmptyString(element))
  );
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
