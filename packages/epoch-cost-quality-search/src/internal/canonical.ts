/**
 * Canonical serialization for @zcode/epoch-cost-quality-search.
 *
 * Laws (see src/module.ts):
 * - Deterministic: the same VALUE always serializes to the same string.
 * - Object keys are sorted lexicographically by UTF-16 code unit order.
 * - Arrays keep their element order (order is semantic).
 * - `undefined`, functions, symbols, bigints and non-finite numbers are
 *   rejected: canonical data must be complete and finite.
 * - Numbers use ECMAScript's shortest round-trip decimal form (JSON.stringify).
 */

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, []);
}

function serialize(value: unknown, path: string[]): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value, path);
    case "string":
      return JSON.stringify(value);
    case "object":
      return Array.isArray(value) ? serializeArray(value, path) : serializeObject(value as Record<string, unknown>, path);
    default:
      throw new CanonicalizationError(`unsupported value of type "${typeof value}" at ${pathLabel(path)}`);
  }
}
...
