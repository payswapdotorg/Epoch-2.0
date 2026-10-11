import { TimelineError } from "./errors.js";

/**
 * Canonical JSON: object keys sorted (code-unit order), no whitespace,
 * arrays preserve order, numbers rendered via their shortest round-trip
 * form, `undefined` object members omitted. Deterministic by construction —
 * no timestamps, no random data.
 */
export function canonicalJson(value: unknown): string {
  return write(value);
}

function write(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return writeNumber(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      return writeObject(value);
    default:
      throw new TimelineError(
        "serialization-invalid",
        `cannot canonicalize a value of type "${typeof value}"`,
        { valueType: typeof value },
      );
  }
}

function writeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TimelineError("serialization-invalid", "cannot canonicalize a non-finite number", {
      value: String(value),
    });
  }
  // `String(number)` is the shortest round-trip representation and maps
  // `-0` to `"0"`, keeping canonical forms stable.
  return String(value);
}

function writeObject(value: object): string {
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      if (item === undefined) {
        throw new TimelineError(
          "serialization-invalid",
          "cannot canonicalize `undefined` inside an array",
        );
      }
      parts.push(write(item));
    }
    return `[${parts.join(",")}]`;
  }
  if (value instanceof Map || value instanceof Set || value instanceof Date) {
    throw new TimelineError("serialization-invalid", "cannot canonicalize non-JSON containers", {
      constructor: value.constructor.name,
    });
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${write(record[key])}`);
  return `{${parts.join(",")}}`;
}
