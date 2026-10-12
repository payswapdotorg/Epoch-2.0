import { createHash } from "node:crypto";

export type CanonicalPrimitive = string | number | boolean | null;

export type CanonicalValue =
  | CanonicalPrimitive
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export type HexDigest = string & { readonly __brand: "HexDigest" };

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalJson: non-finite number is not canonicalizable: ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((element) => canonicalJson(element)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonicalJson: value is not canonicalizable: ${typeof value}`);
}

export function sha256Hex(input: string): HexDigest {
  return createHash("sha256").update(input, "utf8").digest("hex") as HexDigest;
}

export function sha256Canonical(value: unknown): HexDigest {
  return sha256Hex(canonicalJson(value));
}
