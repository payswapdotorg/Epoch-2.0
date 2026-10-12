import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  compareStrings,
  isBoolean,
  isDigest,
  isIso8601Utc,
  isKebabId,
  isNonEmptyString,
  isNonEmptyStringArray,
  isNonNegativeInteger,
  isPositiveInteger,
  isSemver,
  sortedUnique,
  toDigest,
  toKebabId,
  toNonNegativeInteger,
  toNonEmptyString,
  toPositiveInteger,
  toSemver,
  toToolId,
  toUtcTimestamp,
} from "../src/index.js";

test("isKebabId accepts kebab ids and rejects others", () => {
  for (const good of ["obj", "blender-bpy-headless", "a", "3mf", "x3d-2", "step"]) {
    assert.equal(isKebabId(good), true, good);
  }
  for (const bad of [
    "",
    "NotKebab",
    "has space",
    "under_score",
    "-leading",
    "trailing-",
    "double--dash",
    "UPPER",
  ]) {
    assert.equal(isKebabId(bad), false, bad);
  }
  assert.equal(isKebabId(42), false);
  assert.equal(isKebabId(null), false);
});

test("isSemver accepts x.y.z and rejects others", () => {
  for (const good of ["4.2.0", "1.0.0", "0.20.2", "4.2.0-alpha.1", "1.0.0+build.7"]) {
    assert.equal(isSemver(good), true, good);
  }
  for (const bad of ["4.2", "v4.2.0", "4", "x.y.z", "4.2.0.1", "", "4.2.0_1"]) {
    assert.equal(isSemver(bad), false, bad);
  }
});

test("isDigest and isIso8601Utc validate shapes", () => {
  assert.equal(isDigest("a".repeat(64)), true);
  assert.equal(isDigest("A".repeat(64)), false);
  assert.equal(isDigest("abc"), false);
  assert.equal(isDigest(7), false);
  assert.equal(isIso8601Utc("2025-01-15T09:30:00Z"), true);
  assert.equal(isIso8601Utc("2025-01-15T09:30:00.123Z"), true);
  assert.equal(isIso8601Utc("2025-01-15T09:30:00+00:00"), false);
  assert.equal(isIso8601Utc("2025-01-15 09:30:00Z"), false);
  assert.equal(isIso8601Utc("2025-01-15"), false);
});

test("integer and boolean guards behave", () => {
  for (const good of [0, 1, 100]) {
    assert.equal(isNonNegativeInteger(good), true);
  }
  for (const bad of [-1, 1.5, "3", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(isNonNegativeInteger(bad), false);
  }
  assert.equal(isPositiveInteger(1), true);
  assert.equal(isPositiveInteger(5), true);
  for (const bad of [0, -1, 2.5, "1"]) {
    assert.equal(isPositiveInteger(bad), false);
  }
  assert.equal(isBoolean(true), true);
  assert.equal(isBoolean(false), true);
  assert.equal(isBoolean("true"), false);
  assert.equal(isBoolean(1), false);
});

test("string guards: nonEmptyString and arrays", () => {
  assert.equal(isNonEmptyString("a"), true);
  assert.equal(isNonEmptyString(""), false);
  assert.equal(isNonEmptyString(1), false);
  assert.equal(isNonEmptyStringArray(["a", "b"]), true);
  assert.equal(isNonEmptyStringArray([]), true);
  assert.equal(isNonEmptyStringArray(["a", ""]), false);
  assert.equal(isNonEmptyStringArray("nope"), false);
});

test("constructors brand valid values, throw on invalid, and sort helpers work", () => {
  assert.equal(toKebabId("ok-id"), "ok-id");
  assert.throws(() => toKebabId("NO"));
  assert.equal(toNonEmptyString("x"), "x");
  assert.throws(() => toNonEmptyString(""));
  assert.equal(toSemver("4.2.0"), "4.2.0");
  assert.throws(() => toSemver("4.2"));
  assert.equal(toDigest("b".repeat(64)), "b".repeat(64));
  assert.throws(() => toDigest("zz"));
  assert.equal(toUtcTimestamp("2025-01-15T09:30:00Z"), "2025-01-15T09:30:00Z");
  assert.throws(() => toUtcTimestamp("yesterday"));
  assert.equal(toToolId("freecad-console"), "freecad-console");
  assert.throws(() => toToolId("FreeCAD"));
  assert.equal(toNonNegativeInteger(0), 0);
  assert.throws(() => toNonNegativeInteger(-1));
  assert.equal(toPositiveInteger(3), 3);
  assert.throws(() => toPositiveInteger(0));
  assert.deepEqual(sortedUnique(["b", "a", "b", "c", "a"]), ["a", "b", "c"]);
  assert.ok(compareStrings("a", "b") < 0);
  assert.ok(compareStrings("b", "a") > 0);
  assert.equal(compareStrings("same", "same"), 0);
});
