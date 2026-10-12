import type { WorkStatus } from "./types/work.js";

/** Guard: a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Guard: a kebab-case identifier (lowercase alphanumerics, hyphen-separated). */
export function isKebabId(value: unknown): value is string {
  return typeof value === "string" && KEBAB_ID_PATTERN.test(value);
}

const HEX64_PATTERN = /^[0-9a-f]{64}$/;

/** Guard: a 64-character lowercase hex digest string. */
export function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_PATTERN.test(value);
}

/** Guard: a non-negative integer number. */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Guard: any finite number. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const WORK_STATUSES: readonly WorkStatus[] = ["idle", "active", "blocked"];

/** Guard: a work status (idle | active | blocked). */
export function isWorkStatus(value: unknown): value is WorkStatus {
  return typeof value === "string" && WORK_STATUSES.some((status) => status === value);
}
