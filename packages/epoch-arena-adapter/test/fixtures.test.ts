import test from "node:test";
import assert from "node:assert/strict";
import { sealReturnPackage, validateReturnPackage } from "../src/return.js";
import { verifyTaskPackageDigest } from "../src/task.js";
import { CLOCK, goodDraft, makeTaskPackage } from "./fixtures.js";

test("fixtures: task package builds and digest-verifies", () => {
  const task = makeTaskPackage();
  assert.equal(verifyTaskPackageDigest(task), true);
  assert.equal(task.evidence.length, 3);
});

test("fixtures: good draft seals into a structurally valid return", () => {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(goodDraft(task), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  assert.equal(validateReturnPackage(ret, task).ok, true);
});
