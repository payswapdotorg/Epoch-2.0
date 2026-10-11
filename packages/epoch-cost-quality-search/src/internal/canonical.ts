/**
 * Canonical serialization — the single digest basis of this package (W033).
 *
 * Laws:
 * - Deterministic: equal values always serialize to the identical string.
 * - Object keys are sorted lexicographically (UTF-16 code-unit order);
 *   array element order is preserved because order is semantic data.
 * - `undefined`, functions, symbols, bigints and non-finite numbers are
 *   rejected: canonical records must be complete and finite.
 * - Only plain data objects (prototype `Object.prototype` or `null`) are
 *   accepted, so class instances and built-ins cannot silently lose data.
 * - Numbers serialize via JSON.stringify (shortest round-trip decimal form).
 * - No rounding of any kind happens here.
 */

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

/** Serialize a plain data value to its canonical JSON form. */
export function canonicalJson(value: unknown): string {
  return serialize(value, []);
}

function serialize(value: unknown, path: string[]): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value, path);
    case "string":
      return serializeString(value);
    case "object":
      return Array.isArray(value)
        ? serializeArray(value as unknown[], path)
        : serializeObject(value as Record<string, unknown>, path);
    default:
      throw new CanonicalizationError(
        `unsupported value of type "${typeof value}" at ${pathLabel(path)}; ` +
          "canonical records must be complete data " +
          "(no undefined/functions/symbols/bigints)",
      );
  }
}

function serializeNumber(value: number, path: string[]): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(
      `non-finite number at ${pathLabel(path)}; canonical records must be finite`,
    );
  }
  return JSON.stringify(value);
}

function serializeString(value: string): string {
  return JSON.stringify(value);
}

function serializeArray(values: readonly unknown[], path: string[]): string {
  const parts: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    parts.push(serialize(values[index], [...path, String(index)]));
  }
  return `[${parts.join(",")}]`;
}

function serializeObject(
  value: Record<string, unknown>,
  path: string[],
): string {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalizationError(
      `non-plain object at ${pathLabel(path)}; ` +
        "convert class instances to plain data before hashing",
    );
  }
  const keys = Object.keys(value).sort(compareKey);
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(
      `${serializeString(key)}:${serialize(value[key], [...path, key])}`,
    );
  }
  return `{${parts.join(",")}}`;
}

function compareKey(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function pathLabel(path: readonly string[]): string {
  if (path.length === 0) {
    return "$";
  }
  let label = "$";
  for (const segment of path) {
    label += /^[A-Za-z0-9_]+$/.test(segment)
      ? `.${segment}`
      : `[${JSON.stringify(segment)}]`;
  }
  return label;
}
