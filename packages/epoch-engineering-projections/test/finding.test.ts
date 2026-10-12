import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceFindingStatus, buildFinding } from "../src/index.js";
import type { FindingInput, FindingRecord } from "../src/index.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const entityA = hex("a");

function okFinding(input: FindingInput): FindingRecord {
  const result = buildFinding(input);
  if (!result.ok) {
    throw new Error(`finding rejected: ${JSON.stringify(result.rejection)}`);
  }
  return result.value;
}

const baseFinding: FindingInput = {
  findingId: "finding-wall-w1-cover",
  entityDigest: entityA,
  severity: "major",
  title: "Insufficient cover on wall W1",
  detail: "Cover measured below the specification.",
  evidence: [hex("e")],
  constraintRefs: ["constraint-corridor-clearance"],
  boqItemRefs: ["boq-item-wall-w1"],
  raisedAt: "2025-06-03T08:00:00Z",
};

test("builds a finding that starts open with an empty history", () => {
  const finding = okFinding(baseFinding);
  assert.equal(finding.findingId, "finding-wall-w1-cover");
  assert.equal(finding.entityDigest, entityA);
  assert.equal(finding.severity, "major");
  assert.equal(finding.status, "open");
  assert.deepEqual(finding.statusHistory, []);
  assert.deepEqual(finding.evidence, [hex("e")]);
  assert.deepEqual(finding.constraintRefs, ["constraint-corridor-clearance"]);
  assert.deepEqual(finding.boqItemRefs, ["boq-item-wall-w1"]);
});

test("rejects an invalid severity", () => {
  const result = buildFinding({
    ...baseFinding,
    severity: "catastrophic" as unknown as FindingInput["severity"],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "invalid-severity", severity: "catastrophic" });
});

test("rejects empty or invalid evidence", () => {
  const empty = buildFinding({ ...baseFinding, evidence: [] });
  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(empty.rejection, { kind: "empty-evidence" });

  const invalid = buildFinding({ ...baseFinding, evidence: ["bad"] });
  assert.equal(invalid.ok, false);
  if (invalid.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(invalid.rejection, { kind: "invalid-evidence", index: 0, digest: "bad" });
});

test("advances the status along the data-declared lifecycle", () => {
  const finding = okFinding(baseFinding);
  const result = advanceFindingStatus(finding, "in-review", "2025-06-04T09:00:00Z");
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.equal(result.value.status, "in-review");
  assert.equal(result.value.findingId, "finding-wall-w1-cover");
  assert.deepEqual(result.value.statusHistory, [
    { from: "open", to: "in-review", at: "2025-06-04T09:00:00Z" },
  ]);
});

test("rejects an illegal transition", () => {
  const finding = okFinding(baseFinding);
  const result = advanceFindingStatus(finding, "resolved", "2025-06-04T09:00:00Z");
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "illegal-transition", from: "open", to: "resolved" });
});

test("rejects an invalid next status or transition timestamp", () => {
  const finding = okFinding(baseFinding);
  const badStatus = advanceFindingStatus(finding, "done", "2025-06-04T09:00:00Z");
  assert.equal(badStatus.ok, false);
  if (badStatus.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(badStatus.rejection, { kind: "invalid-next-status", nextStatus: "done" });

  const badAt = advanceFindingStatus(finding, "in-review", "2025-06-04");
  assert.equal(badAt.ok, false);
  if (badAt.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(badAt.rejection, { kind: "invalid-at", at: "2025-06-04" });
});

test("supports the full lifecycle and rejects transitions from terminal states", () => {
  const open = okFinding(baseFinding);
  const inReview = advanceFindingStatus(open, "in-review", "2025-06-04T09:00:00Z");
  assert.equal(inReview.ok, true);
  if (!inReview.ok) {
    assert.fail("expected success");
  }
  const resolved = advanceFindingStatus(inReview.value, "resolved", "2025-06-05T09:00:00Z");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) {
    assert.fail("expected success");
  }
  assert.equal(resolved.value.status, "resolved");
  assert.equal(resolved.value.statusHistory.length, 2);

  const reopen = advanceFindingStatus(resolved.value, "open", "2025-06-06T09:00:00Z");
  assert.equal(reopen.ok, false);
  if (reopen.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(reopen.rejection, { kind: "illegal-transition", from: "resolved", to: "open" });
});
