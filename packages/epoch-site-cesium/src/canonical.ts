import { createHash } from "node:crypto";

/** Canonical JSON: recursively sorted object keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number": {
      if (!Number.isFinite(value)) {
        throw new Error("canonicalJson: non-finite numbers are not canonicalizable");
      }
      return JSON.stringify(value);
    }
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalize(item)).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported value of type ${typeof value}`);
  }
}

/** SHA-256 over a UTF-8 string, as lowercase hex. Never hand-rolled. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 over the canonical JSON of a value, as lowercase hex. */
export function digestJson(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
