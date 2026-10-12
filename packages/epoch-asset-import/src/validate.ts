export function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function kebabId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

export function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isHexString64(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isIso8601Utc(value: unknown): value is string {
  return (
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)
  );
}
