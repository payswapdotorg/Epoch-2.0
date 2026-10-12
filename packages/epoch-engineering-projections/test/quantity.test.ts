import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuantityTakeoff } from "../src/index.js";
import type { QuantityTakeoff, TakeoffInput } from "../src/index.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const entityA = hex("a");

function okTakeoff(input: TakeoffInput): QuantityTakeoff {
  const result = buildQuantityTakeoff(input);
  if (!result.ok) {
    throw new Error(`takeoff rejected: ${JSON.stringify(result.rejection)}`);
  }
  return result.value;
}

const lengthTakeoff: TakeoffInput = {
  takeoffId: "takeoff-wall-w1-length",
  entityDigest: entityA,
  method: { kind: "centerline-length", elementLabel: "wall W1 centerline" },
  basis: { kind: "geometry", geometryDigest: hex("c") },
  measureKind: "length",
  value: 5.5,
  recordedAt: "2025-06-01T09:00:00Z",
};

test("builds a length takeoff with an explicit method and basis", () => {
  const result = buildQuantityTakeoff(lengthTakeoff);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.equal(result.value.takeoffId, "takeoff-wall-w1-length");
  assert.equal(result.value.entityDigest, entityA);
  assert.equal(result.value.method.kind, "centerline-length");
  assert.equal(result.value.basis.kind, "geometry");
  assert.deepEqual(result.value.quantity, { measureKind: "length", value: 5.5, unit: "m" });
  assert.equal(result.value.recordedAt, "2025-06-01T09:00:00Z");
});

test("builds a volume takeoff with the derived unit m3", () => {
  const result = buildQuantityTakeoff({
    ...lengthTakeoff,
    takeoffId: "takeoff-foundation-f1-volume",
    method: { kind: "solid-volume" },
    measureKind: "volume",
    value: 12.25,
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.deepEqual(result.value.quantity, { measureKind: "volume", value: 12.25, unit: "m3" });
});

test("rejects a method that does not produce the declared measure kind", () => {
  const result = buildQuantityTakeoff({ ...lengthTakeoff, measureKind: "area" });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "method-kind-mismatch",
    methodKind: "centerline-length",
    measureKind: "area",
  });
});

test("rejects an unknown takeoff method kind", () => {
  const result = buildQuantityTakeoff({
    ...lengthTakeoff,
    method: { kind: "bogus" } as unknown as TakeoffInput["method"],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.equal(result.rejection.kind, "invalid-method");
  if (result.rejection.kind !== "invalid-method") {
    assert.fail("wrong rejection kind");
  }
  assert.match(result.rejection.reason, /unknown takeoff method kind/);
});

test("rejects invalid values (negative or non-finite)", () => {
  const negative = buildQuantityTakeoff({ ...lengthTakeoff, value: -1 });
  assert.equal(negative.ok, false);
  if (negative.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(negative.rejection, { kind: "invalid-value", value: -1 });

  const nan = buildQuantityTakeoff({ ...lengthTakeoff, value: Number.NaN });
  assert.equal(nan.ok, false);
  if (nan.ok) {
    assert.fail("expected rejection");
  }
  assert.equal(nan.rejection.kind, "invalid-value");
});

test("rejects an invalid entity digest", () => {
  const result = buildQuantityTakeoff({ ...lengthTakeoff, entityDigest: "abc" });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "invalid-entity-digest", entityDigest: "abc" });
});

test("accepts a manual-survey measurement basis", () => {
  const result = buildQuantityTakeoff({
    ...lengthTakeoff,
    basis: { kind: "manual-survey", surveyId: "survey-01", surveyedAt: "2025-06-01T08:00:00Z" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.deepEqual(result.value.basis, {
    kind: "manual-survey",
    surveyId: "survey-01",
    surveyedAt: "2025-06-01T08:00:00Z",
  });
});

test("rejects an invalid geometry basis digest", () => {
  const result = buildQuantityTakeoff({
    ...lengthTakeoff,
    basis: { kind: "geometry", geometryDigest: "xyz" },
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.equal(result.rejection.kind, "invalid-basis");
  if (result.rejection.kind !== "invalid-basis") {
    assert.fail("wrong rejection kind");
  }
  assert.match(result.rejection.reason, /geometryDigest/);
});

test("rejects an invalid recordedAt timestamp", () => {
  const result = buildQuantityTakeoff({ ...lengthTakeoff, recordedAt: "2025-06-01" });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "invalid-recorded-at", recordedAt: "2025-06-01" });
});

test("is deterministic for identical inputs", () => {
  assert.deepEqual(okTakeoff(lengthTakeoff), okTakeoff(lengthTakeoff));
});
