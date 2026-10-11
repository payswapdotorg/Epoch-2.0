/**
 * W022 tests — lifecycle contracts as data: the phase catalog and policies.
 */

import * as assert from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_LIFECYCLE_POLICY,
  DEFAULT_LIFECYCLE_POLICY_ID,
  LIFECYCLE_PHASE_BY_ID,
  LIFECYCLE_PHASE_ORDER,
  LIFECYCLE_PHASES,
  LifecycleError,
  edgeKey,
  findEdge,
  isLifecyclePhaseId,
  isReworkTransition,
  validateLifecyclePolicy,
} from "../src/index.ts";

function expectPolicyError(policy: unknown): void {
  assert.throws(
    () => validateLifecyclePolicy(policy),
    (error: unknown) => error instanceof LifecycleError && error.code === "invalid-policy",
  );
}

test("phase catalog: the ten canonical phases in order", () => {
  assert.deepStrictEqual([...LIFECYCLE_PHASE_ORDER], [
    "understand",
    "decide",
    "plan",
    "acquire",
    "realize",
    "observe",
    "verify",
    "forecast",
    "close",
    "learn",
  ]);
  assert.strictEqual(LIFECYCLE_PHASES.length, 10);
  assert.strictEqual(LIFECYCLE_PHASE_BY_ID.learn.name, "Learn");
});

test("phase definitions: entry and exit criteria are data, never behavior", () => {
  for (const definition of LIFECYCLE_PHASES) {
    assert.ok(definition.name.length > 0);
    assert.ok(definition.entryCriteria.length > 0);
    assert.ok(definition.exitCriteria.length > 0);
    assert.ok(definition.entryCriteria.every((criterion: string) => typeof criterion === "string"));
    assert.ok(definition.exitCriteria.every((criterion: string) => typeof criterion === "string"));
  }
});

test("phase guards: isLifecyclePhaseId accepts exactly the ten phase ids", () => {
  for (const id of LIFECYCLE_PHASE_ORDER) {
    assert.ok(isLifecyclePhaseId(id));
  }
  for (const bad of ["", "Understand", "obtain", "learn2", null, 7]) {
    assert.ok(!isLifecyclePhaseId(bad));
  }
});

test("default policy: standard forward chain plus rework loops Verify->Understand and Observe->Plan", () => {
  assert.strictEqual(DEFAULT_LIFECYCLE_POLICY.id, DEFAULT_LIFECYCLE_POLICY_ID);
  const keys = DEFAULT_LIFECYCLE_POLICY.edges.map(edgeKey).sort();
  assert.deepStrictEqual(keys, [
    "acquire->realize",
    "close->learn",
    "decide->plan",
    "forecast->close",
    "observe->plan",
    "observe->verify",
    "plan->acquire",
    "realize->observe",
    "understand->decide",
    "verify->forecast",
    "verify->understand",
  ]);
  assert.ok(findEdge(DEFAULT_LIFECYCLE_POLICY, "verify", "understand")?.kind === "rework");
  assert.ok(findEdge(DEFAULT_LIFECYCLE_POLICY, "observe", "plan")?.kind === "rework");
  assert.ok(isReworkTransition("verify", "understand"));
  assert.ok(!isReworkTransition("understand", "decide"));
});

test("policy validation: rejects a policy without an id", () => {
  expectPolicyError({ id: "", edges: [{ from: "understand", to: "decide", kind: "forward" }] });
});

test("policy validation: rejects a policy without edges", () => {
  expectPolicyError({ id: "p", edges: [] });
  expectPolicyError({ id: "p" });
});

test("policy validation: rejects edges referencing unknown phases", () => {
  expectPolicyError({ id: "p", edges: [{ from: "understand", to: "deliver", kind: "forward" }] });
});

test("policy validation: rejects unknown edge kinds", () => {
  expectPolicyError({ id: "p", edges: [{ from: "understand", to: "decide", kind: "sideways" }] });
});

test("policy validation: rejects self-edges", () => {
  expectPolicyError({ id: "p", edges: [{ from: "decide", to: "decide", kind: "forward" }] });
});

test("policy validation: rejects duplicate edges", () => {
  expectPolicyError({
    id: "p",
    edges: [
      { from: "understand", to: "decide", kind: "forward" },
      { from: "understand", to: "decide", kind: "forward" },
    ],
  });
});

test("policy validation: rejects a non-adjacent edge marked forward", () => {
  expectPolicyError({ id: "p", edges: [{ from: "understand", to: "plan", kind: "forward" }] });
});

test("policy validation: rejects an adjacent edge marked rework", () => {
  expectPolicyError({ id: "p", edges: [{ from: "understand", to: "decide", kind: "rework" }] });
});

test("policy validation: accepts a valid custom policy", () => {
  const custom = {
    id: "strict",
    edges: [
      { from: "understand", to: "decide", kind: "forward" },
      { from: "decide", to: "plan", kind: "forward" },
      { from: "verify", to: "understand", kind: "rework" },
    ],
  };
  validateLifecyclePolicy(custom);
  assert.ok(true);
});
