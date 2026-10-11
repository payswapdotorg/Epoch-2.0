import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUALIFICATION_TRANSITIONS,
  isQualifiedStatus,
  rankOf,
  statusSatisfies,
  stepDown,
  transitionDirection,
} from "./under-test.mjs";

test("ranks order prototype < named-task-qualified < reference-comparable < reference-superior", () => {
  assert.equal(rankOf("prototype"), 0);
  assert.equal(rankOf("named-task-qualified"), 1);
  assert.equal(rankOf("reference-comparable"), 2);
  assert.equal(rankOf("reference-superior"), 3);
});

test("QUALIFICATION_TRANSITIONS allows exactly one-rung moves", () => {
  for (const [from, targets] of Object.entries(QUALIFICATION_TRANSITIONS)) {
    assert.ok(targets.length >= 1);
    for (const to of targets) {
      assert.equal(Math.abs(rankOf(to) - rankOf(from)), 1);
    }
  }
});

test("transitionDirection labels promotions and regressions", () => {
  assert.equal(
    transitionDirection("prototype", "named-task-qualified"),
    "promotion",
  );
  assert.equal(
    transitionDirection("named-task-qualified", "prototype"),
    "regression",
  );
  assert.equal(
    transitionDirection("reference-comparable", "reference-superior"),
    "promotion",
  );
  assert.equal(
    transitionDirection("reference-superior", "reference-comparable"),
    "regression",
  );
});

test("transitionDirection rejects multi-rung jumps and self-transitions", () => {
  assert.equal(transitionDirection("prototype", "reference-superior"), null);
  assert.equal(transitionDirection("prototype", "reference-comparable"), null);
  assert.equal(transitionDirection("prototype", "prototype"), null);
});

test("stepDown demotes one rung and floors at prototype", () => {
  assert.equal(stepDown("reference-superior"), "reference-comparable");
  assert.equal(stepDown("reference-comparable"), "named-task-qualified");
  assert.equal(stepDown("named-task-qualified"), "prototype");
  assert.equal(stepDown("prototype"), "prototype");
});

test("isQualifiedStatus is false only for prototype", () => {
  assert.equal(isQualifiedStatus("prototype"), false);
  assert.equal(isQualifiedStatus("named-task-qualified"), true);
  assert.equal(isQualifiedStatus("reference-comparable"), true);
  assert.equal(isQualifiedStatus("reference-superior"), true);
});

test("statusSatisfies compares by rank", () => {
  assert.equal(
    statusSatisfies("reference-superior", "named-task-qualified"),
    true,
  );
  assert.equal(
    statusSatisfies("named-task-qualified", "named-task-qualified"),
    true,
  );
  assert.equal(statusSatisfies("prototype", "named-task-qualified"), false);
});
