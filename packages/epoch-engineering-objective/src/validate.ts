/**
 * Shared input validators for W035 builders. Pure functions; no imports.
 * Every builder validates untrusted record data through these helpers so
 * malformed inputs fail fast with a precise, deterministic error.
 */

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const NAMESPACE_PATTERN = /^[a-z0-9]+([-:][a-z0-9]+)*$/;

export function nonEmptyString(what: string, value: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(
      `${what}: non-empty string without surrounding whitespace expected, got: ${JSON.stringify(value)}`
    );
  }
  return value;
}

export function kebabId(what: string, value: string): string {
  nonEmptyString(what, value);
  if (!KEBAB_CASE_PATTERN.test(value)) {
    throw new TypeError(
      `${what}: kebab-case identifier expected, got: ${JSON.stringify(value)}`
    );
  }
  return value;
}

export function semverVersion(what: string, value: string): string {
  nonEmptyString(what, value);
  if (!SEMVER_PATTERN.test(value)) {
    throw new TypeError(
      `${what}: MAJOR.MINOR.PATCH version expected, got: ${JSON.stringify(value)}`
    );
  }
  return value;
}

export function isoTimestamp(what: string, value: string): string {
  nonEmptyString(what, value);
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new TypeError(
      `${what}: ISO-8601 timestamp expected, got: ${JSON.stringify(value)}`
    );
  }
  return value;
}

export function nonNegativeInteger(what: string, value: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(
      `${what}: non-negative integer expected, got: ${String(value)}`
    );
  }
  return value;
}

export function nonNegativeNumber(what: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `${what}: non-negative finite number expected, got: ${String(value)}`
    );
  }
  return value;
}

export function booleanFlag(what: string, value: boolean): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${what}: boolean expected, got: ${String(value)}`);
  }
  return value;
}

export function namespaceValue(what: string, value: string): string {
  nonEmptyString(what, value);
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(
      `${what}: lowercase namespace with '-' or ':' separators expected, got: ${JSON.stringify(value)}`
    );
  }
  return value;
}
