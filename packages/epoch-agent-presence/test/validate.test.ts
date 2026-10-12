import { test } from "node:test";
import { equal } from "node:assert/strict";
import { isHex64, isKebabId, isNonEmptyString, isNonNegativeInteger } from "../src/index.js";

const HEX = "a".repeat(64);

test("isNonEmptyString accepts only non-empty strings", () => {
  equal(isNonEmptyString("a"), true);
  equal(isNonEmptyString(""), false);
  equal(isNonEmptyString(1), false);
  equal(isNonEmptyString(null), false);
});

test("isKebabId accepts kebab-case ids only", () => {
  equal(isKebabId("agent-alpha"), true);
  equal(isKebabId("w017-presence"), true);
  equal(isKebabId("a"), true);
  equal(isKebabId("Agent-Alpha"), false);
  equal(isKebabId("-lead"), false);
  equal(isKebabId("trail-"), false);
  equal(isKebabId("double--dash"), false);
  equal(isKebabId("under_score"), false);
  equal(isKebabId(""), false);
});

test("isHex64 accepts 64-char lowercase hex only", () => {
  equal(isHex64(HEX), true);
  equal(isHex64("0123456789abcdef".repeat(4)), true);
  equal(isHex64(HEX.toUpperCase()), false);
  equal(isHex64(HEX.slice(0, 63)), false);
  equal(isHex64(`${HEX}0`), false);
  equal(isHex64(42), false);
});

test("isNonNegativeInteger accepts non-negative integers only", () => {
  equal(isNonNegativeInteger(0), true);
  equal(isNonNegativeInteger(7), true);
  equal(isNonNegativeInteger(-1), false);
  equal(isNonNegativeInteger(1.5), false);
  equal(isNonNegativeInteger(Number.NaN), false);
  equal(isNonNegativeInteger("3"), false);
});
