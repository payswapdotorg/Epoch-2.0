import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConstraint, buildQuantityTakeoff, validateConstraints } from "../src/index.js";
import type {
  ConstraintInput,
  ConstraintRecord,
  QuantityTakeoff,
  TakeoffInput,
} from "../src/index.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const entityA = hex("a");
const entityB = hex("b");

function okTakeoff(input: TakeoffInput): QuantityTakeoff {
  const result = buildQuantityTakeoff(input);
  if (!result.ok) {
    throw new Error(`takeoff rejected: ${JSON.stringify(result.rejection)}`);
  }
  return result.value;
}

function okConstraint(input: ConstraintInput): ConstraintRecord {
  const result = buildConstraint(input);
  if (!result.ok) {
    throw new Error(`constraint rejected: ${JSON.stringify(result.rejection)}`);
  }
  return result.value;
}

const takeoffCorridor: TakeoffInput = {
  takeoffId: "takeoff-corridor-length",
  entityDigest: entityA,
  method: { kind: "centerline-length", elementLabel: "corridor centerline" },
  basis: { kind: "geometry", geometryDigest: hex("c") },
  measureKind: "length",
  value: 5.5,
  recordedAt: "2025-06-01T09:00:00Z",
};

const takeoffRoom: TakeoffInput = {
  takeoffId: "takeoff-room-area",
  entityDigest: entityA,
  method: { kind: "footprint-area" },
  basis: { kind: "geometry", geometryDigest: hex("c") },
  measureKind: "area",
  value: 8,
  recordedAt: "2025-06-01T09:05:00Z",
};

function takeoffs(): readonly QuantityTakeoff[] {
  return [okTakeoff(takeoffCorridor), okTakeoff(takeoffRoom)];
}

test("builds a clearance constraint bound to an entity digest", () => {
  const result = buildConstraint({
    constraintId: "constraint-corridor-clearance",
    entityDigest: entityA,
    kind: { kind: "clearance", requiredLengthM: 1.2 },
    note: "Means-of-escape clearance",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.equal(result.value.constraintId, "constraint-corridor-clearance");
  assert.equal(result.value.entityDigest, entityA);
  assert.deepEqual(result.value.kind, { kind: "clearance", requiredLengthM: 1.2 });
  assert.equal(result.value.note, "Means-of-escape clearance");
});

test("builds capacity and code-reference constraints", () => {
  const capacity = buildConstraint({
    constraintId: "constraint-room-capacity",
    entityDigest: entityA,
    kind: { kind: "capacity", requirement: { measureKind: "area", value: 10 } },
  });
  assert.equal(capacity.ok, true);
  if (!capacity.ok) {
    assert.fail("expected success");
  }
  assert.deepEqual(capacity.value.kind, {
    kind: "capacity",
    requirement: { measureKind: "area", value: 10 },
  });

  const codeReference = buildConstraint({
    constraintId: "constraint-wall-code",
    entityDigest: entityA,
    kind: { kind: "code-reference", code: "EN-1992", clause: "6.1" },
  });
  assert.equal(codeReference.ok, true);
  if (!codeReference.ok) {
    assert.fail("expected success");
  }
  assert.deepEqual(codeReference.value.kind, {
    kind: "code-reference",
    code: "EN-1992",
    clause: "6.1",
  });
});

test("rejects invalid constraint kinds", () => {
  const badCapacity = buildConstraint({
    constraintId: "constraint-bad-capacity",
    entityDigest: entityA,
    kind: { kind: "capacity", requirement: { measureKind: "area", value: -5 } },
  });
  assert.equal(badCapacity.ok, false);
  if (badCapacity.ok) {
    assert.fail("expected rejection");
  }
  assert.equal(badCapacity.rejection.kind, "invalid-kind");
  if (badCapacity.rejection.kind !== "invalid-kind") {
    assert.fail("wrong rejection kind");
  }
  assert.match(badCapacity.rejection.reason, /non-negative/);

  const badCode = buildConstraint({
    constraintId: "constraint-bad-code",
    entityDigest: entityA,
    kind: { kind: "code-reference", code: "" },
  });
  assert.equal(badCode.ok, false);
  if (badCode.ok) {
    assert.fail("expected rejection");
  }
  assert.equal(badCode.rejection.kind, "invalid-kind");
  if (badCode.rejection.kind !== "invalid-kind") {
    assert.fail("wrong rejection kind");
  }
  assert.match(badCode.rejection.reason, /non-empty/);
});

test("validateConstraints passes when the minimum measured value meets the requirement", () => {
  const clearance = okConstraint({
    constraintId: "constraint-corridor-clearance",
    entityDigest: entityA,
    kind: { kind: "clearance", requiredLengthM: 1.2 },
  });
  const result = validateConstraints([clearance], takeoffs());
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  const verdict = result.value[0];
  assert.ok(verdict !== undefined);
  assert.equal(verdict.outcome, "pass");
  assert.equal(verdict.minMeasured, 5.5);
  assert.deepEqual(verdict.requirement, { measureKind: "length", value: 1.2 });
  assert.deepEqual(verdict.evidenceTakeoffIds, ["takeoff-corridor-length"]);
  assert.match(verdict.reason, /meets the required/);
});

test("validateConstraints fails when the minimum measured value is below the requirement", () => {
  const capacity = okConstraint({
    constraintId: "constraint-room-capacity",
    entityDigest: entityA,
    kind: { kind: "capacity", requirement: { measureKind: "area", value: 10 } },
  });
  const result = validateConstraints([capacity], takeoffs());
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  const verdict = result.value[0];
  assert.ok(verdict !== undefined);
  assert.equal(verdict.outcome, "fail");
  assert.equal(verdict.minMeasured, 8);
  assert.match(verdict.reason, /below the required/);
});

test("validateConstraints returns not-evaluable without matching takeoffs and for code references", () => {
  const otherEntity = okConstraint({
    constraintId: "constraint-other-clearance",
    entityDigest: entityB,
    kind: { kind: "clearance", requiredLengthM: 1.2 },
  });
  const codeReference = okConstraint({
    constraintId: "constraint-wall-code",
    entityDigest: entityA,
    kind: { kind: "code-reference", code: "EN-1992" },
  });
  const result = validateConstraints([otherEntity, codeReference], takeoffs());
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  const noMatch = result.value[0];
  assert.ok(noMatch !== undefined);
  assert.equal(noMatch.outcome, "not-evaluable");
  assert.match(noMatch.reason, /no takeoff records/);
  const codeVerdict = result.value[1];
  assert.ok(codeVerdict !== undefined);
  assert.equal(codeVerdict.outcome, "not-evaluable");
  assert.match(codeVerdict.reason, /out of scope/);
});

test("validateConstraints rejects duplicate ids", () => {
  const first = okConstraint({
    constraintId: "constraint-dup",
    entityDigest: entityA,
    kind: { kind: "clearance", requiredLengthM: 1 },
  });
  const second = okConstraint({
    constraintId: "constraint-dup",
    entityDigest: entityA,
    kind: { kind: "clearance", requiredLengthM: 2 },
  });
  const duplicateConstraints = validateConstraints([first, second], takeoffs());
  assert.equal(duplicateConstraints.ok, false);
  if (duplicateConstraints.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(duplicateConstraints.rejection, {
    kind: "duplicate-constraint-id",
    constraintId: "constraint-dup",
  });

  const corridor = okTakeoff(takeoffCorridor);
  const room = okTakeoff(takeoffRoom);
  const duplicateTakeoffs = validateConstraints([first], [corridor, corridor, room]);
  assert.equal(duplicateTakeoffs.ok, false);
  if (duplicateTakeoffs.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(duplicateTakeoffs.rejection, {
    kind: "duplicate-takeoff-id",
    takeoffId: "takeoff-corridor-length",
  });
});
