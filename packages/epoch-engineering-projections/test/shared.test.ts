import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEASURE_KINDS,
  TAKEOFF_METHOD_MEASURE_KIND,
  UNITS_OF_MEASURE,
  UNIT_FOR_MEASURE_KIND,
  isCurrencyCode,
  isDigest,
  isFindingSeverity,
  isFindingStatus,
  isIso8601,
  isKebabId,
  isMeasureKind,
  isNonEmptyString,
  isNonNegativeInteger,
  isUnitOfMeasure,
} from "../src/index.js";

test("isNonEmptyString accepts non-empty strings only", () => {
  assert.equal(isNonEmptyString("x"), true);
  assert.equal(isNonEmptyString(""), false);
  assert.equal(isNonEmptyString(1), false);
});

test("isKebabId accepts kebab-case ids only", () => {
  assert.equal(isKebabId("a"), true);
  assert.equal(isKebabId("boq-item-wall-w1"), true);
  assert.equal(isKebabId("A"), false);
  assert.equal(isKebabId("a-"), false);
  assert.equal(isKebabId("-a"), false);
  assert.equal(isKebabId("a--b"), false);
  assert.equal(isKebabId("a_b"), false);
  assert.equal(isKebabId(""), false);
});

test("isNonNegativeInteger accepts integers >= 0 only", () => {
  assert.equal(isNonNegativeInteger(0), true);
  assert.equal(isNonNegativeInteger(17), true);
  assert.equal(isNonNegativeInteger(-1), false);
  assert.equal(isNonNegativeInteger(1.5), false);
  assert.equal(isNonNegativeInteger("3"), false);
  assert.equal(isNonNegativeInteger(Number.NaN), false);
  assert.equal(isNonNegativeInteger(Number.POSITIVE_INFINITY), false);
});

test("isIso8601 accepts zoned or offseted timestamps only", () => {
  assert.equal(isIso8601("2025-06-01T09:00:00Z"), true);
  assert.equal(isIso8601("2025-06-01T09:00:00+02:00"), true);
  assert.equal(isIso8601("2025-06-01T09:00:00.123Z"), true);
  assert.equal(isIso8601("2025-06-01"), false);
  assert.equal(isIso8601("2025-06-01 09:00:00Z"), false);
  assert.equal(isIso8601("not-a-date"), false);
  assert.equal(isIso8601(123), false);
});

test("isDigest accepts 64-char lowercase hex only", () => {
  assert.equal(isDigest("0".repeat(64)), true);
  assert.equal(isDigest("a".repeat(64)), true);
  assert.equal(isDigest("A".repeat(64)), false);
  assert.equal(isDigest("a".repeat(63)), false);
  assert.equal(isDigest("a".repeat(65)), false);
  assert.equal(isDigest("g".repeat(64)), false);
  assert.equal(isDigest(42), false);
});

test("isCurrencyCode accepts three uppercase letters only", () => {
  assert.equal(isCurrencyCode("EUR"), true);
  assert.equal(isCurrencyCode("USD"), true);
  assert.equal(isCurrencyCode("eur"), false);
  assert.equal(isCurrencyCode("EU"), false);
  assert.equal(isCurrencyCode("EURO"), false);
  assert.equal(isCurrencyCode(1), false);
});

test("isMeasureKind accepts declared measure kinds only", () => {
  for (const kind of MEASURE_KINDS) {
    assert.equal(isMeasureKind(kind), true);
  }
  assert.equal(isMeasureKind("Length"), false);
  assert.equal(isMeasureKind("money"), false);
});

test("isUnitOfMeasure accepts declared units only", () => {
  for (const unit of UNITS_OF_MEASURE) {
    assert.equal(isUnitOfMeasure(unit), true);
  }
  assert.equal(isUnitOfMeasure("cm"), false);
  assert.equal(isUnitOfMeasure("M"), false);
});

test("isFindingSeverity accepts declared severities only", () => {
  assert.equal(isFindingSeverity("info"), true);
  assert.equal(isFindingSeverity("critical"), true);
  assert.equal(isFindingSeverity("huge"), false);
});

test("isFindingStatus accepts declared statuses only", () => {
  assert.equal(isFindingStatus("open"), true);
  assert.equal(isFindingStatus("in-review"), true);
  assert.equal(isFindingStatus("closed"), false);
});

test("the unit-per-measure-kind law covers every measure kind", () => {
  for (const kind of MEASURE_KINDS) {
    const unit = UNIT_FOR_MEASURE_KIND[kind];
    assert.ok((UNITS_OF_MEASURE as readonly string[]).includes(unit), `missing unit for ${kind}`);
  }
  assert.equal(Object.keys(UNIT_FOR_MEASURE_KIND).length, MEASURE_KINDS.length);
});

test("the takeoff-method law maps every method to a declared measure kind", () => {
  for (const [methodKind, measureKind] of Object.entries(TAKEOFF_METHOD_MEASURE_KIND)) {
    assert.ok(methodKind.length > 0);
    assert.ok(
      (MEASURE_KINDS as readonly string[]).includes(measureKind),
      `undeclared measure kind for ${methodKind}`,
    );
  }
  assert.equal(Object.keys(TAKEOFF_METHOD_MEASURE_KIND).length, 7);
});
