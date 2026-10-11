/**
 * Small shared utilities: deep freezing (no-authority evidence — constructed
 * domain objects are immutable), canonical cloning, and JSON equality.
 */

import type { CanonicalValue } from "./canonical.js";

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    // Our own construction always freezes bottom-up, so an already-frozen
    // object here was frozen by us (or by the caller) as a whole.
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    // Leave non-plain objects (class instances, Dates, …) untouched.
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    deepFreeze(record[key]);
  }
  return Object.freeze(value);
}

export function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isDeepFrozen(item));
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record).every((key) => isDeepFrozen(record[key]));
}

/** Clone a canonical value via JSON (canonical values are JSON-safe by definition). */
export function cloneCanonical(value: CanonicalValue): CanonicalValue {
  return JSON.parse(JSON.stringify(value)) as CanonicalValue;
}

/** Structural JSON equality (both sides are built by this package). */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
