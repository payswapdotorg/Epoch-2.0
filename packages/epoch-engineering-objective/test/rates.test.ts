import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";
import {
  capabilityReuseObservation,
  computeCapabilityReuseRate,
  computeEscalationRate,
  taskExecutionRecord,
} from "../src/build/rates.js";
import { taskFamilyRef } from "../src/build/denominators.js";
import { sha256Hex } from "../src/canonical.js";

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const family = taskFamilyRef("engineering-automation", "1.0.0");

const auto = (taskId: string, outcome: "succeeded" | "failed" | "abandoned") =>
  taskExecutionRecord({
    taskId,
    familyRef,
    taskClassId: "code-review",
    mode: {
      mode: "automated",
      executedBy: "epoch-agent",
      evidence: { namespace: "epoch-agent-tools:command", digest: sha256Hex(`command-${taskId}`) },
    },
    outcome,
  });
const human = (taskId: string) =>
  taskExecutionRecord({
    taskId,
    familyRef,
    taskClassId: "code-review",
    mode: { mode: "human", reason: "requires human judgment" },
    outcome: "succeeded",
  });
const arena = (taskId: string) =>
  taskExecutionRecord({
    taskId,
    familyRef,
    taskClassId: "code-review",
    mode: {
      mode: "arena",
      ref: { namespace: "epoch-agent-tools:audit", digest: sha256Hex(`arena-${taskId}`) },
      reason: "requires arena evaluation",
    },
    outcome: "abandoned",
  });

const executions = [
  auto("task-001", "succeeded"),
  auto("task-002", "failed"),
  human("task-003"),
  arena("task-004"),
];
const r1 = {
  namespace: "epoch-capability-reproduction:record",
  digest: sha256Hex("reproduction-001"),
};
const l1 = {
  namespace: "epoch-capability-learning:intervention",
  digest: sha256Hex("learning-001"),
};
const r2 = {
  namespace: "epoch-capability-reproduction:record",
  digest: sha256Hex("reproduction-002"),
};
const l2 = {
  namespace: "epoch-capability-learning:intervention",
  digest: sha256Hex("learning-002"),
};

test("taskExecutionRecord builds every mode and validates the outcome", () => {
  strictEqual(executions.length, 4);
  strictEqual(executions[0]?.mode.mode, "automated");
  strictEqual(executions[2]?.mode.mode, "human");
  strictEqual(executions[3]?.mode.mode, "arena");
  throws(
    () =>
      taskExecutionRecord({
        taskId: "task-009",
        familyRef,
        taskClassId: "code-review",
        mode: { mode: "human", reason: "r" },
        outcome: "exploded" as unknown as "succeeded",
      }),
    TypeError,
  );
});

test("automated mode requires a valid executor and evidence ref", () => {
  throws(
    () =>
      taskExecutionRecord({
        taskId: "task-009",
        familyRef,
        taskClassId: "code-review",
        mode: {
          mode: "automated",
          executedBy: "Not Kebab",
          evidence: { namespace: "epoch-agent-tools:command", digest: sha256Hex("x") },
        },
        outcome: "succeeded",
      }),
    TypeError,
  );
  throws(
    () =>
      taskExecutionRecord({
        taskId: "task-009",
        familyRef,
        taskClassId: "code-review",
        mode: {
          mode: "automated",
          executedBy: "epoch-agent",
          evidence: { namespace: "epoch-agent-tools:command", digest: "bad" },
        },
        outcome: "succeeded",
      }),
    TypeError,
  );
});

test("computeEscalationRate counts family-scoped executions", () => {
  const rate = computeEscalationRate("rate-001", family, executions);
  strictEqual(rate.totalTasks, 4);
  strictEqual(rate.automatedTasks, 2);
  strictEqual(rate.automatedSuccesses, 1);
  strictEqual(rate.escalatedHumanTasks, 1);
  strictEqual(rate.escalatedArenaTasks, 1);
  strictEqual(rate.rate, 0.5);
});

test("visibility law: human and arena tasks never count as automated successes", () => {
  const rate = computeEscalationRate("rate-001", family, executions);
  deepStrictEqual(rate.automatedSuccessTaskIds, ["task-001"]);
  deepStrictEqual(rate.escalatedTaskIds, ["task-003", "task-004"]);
  ok(!rate.automatedSuccessTaskIds.includes("task-003"));
  ok(!rate.automatedSuccessTaskIds.includes("task-004"));
});

test("escalation rate filters foreign families and is deterministic", () => {
  const foreign = taskExecutionRecord({
    taskId: "task-100",
    familyRef: { familyId: "other-family", version: "1.0.0" },
    taskClassId: "code-review",
    mode: { mode: "human", reason: "r" },
    outcome: "succeeded",
  });
  const withForeign = [...executions, foreign];
  const scoped = computeEscalationRate("rate-002", family, withForeign);
  strictEqual(scoped.totalTasks, 4);
  strictEqual(
    scoped.computedFromDigest,
    computeEscalationRate("rate-002", family, withForeign).computedFromDigest,
  );
});

test("computeCapabilityReuseRate groups capabilities and keeps non-automated tasks visible", () => {
  const observations = [
    capabilityReuseObservation({
      taskId: "task-001",
      familyRef,
      capabilityKey: "review-heuristics",
      reused: true,
      reproductionRef: r1,
      learningRef: l1,
    }),
    capabilityReuseObservation({
      taskId: "task-002",
      familyRef,
      capabilityKey: "review-heuristics",
      reused: true,
      reproductionRef: r1,
      learningRef: l1,
    }),
    capabilityReuseObservation({
      taskId: "task-004",
      familyRef,
      capabilityKey: "test-generation",
      reused: false,
      reproductionRef: r2,
      learningRef: l2,
    }),
  ];
  const reuse = computeCapabilityReuseRate("reuse-001", family, observations, executions);
  strictEqual(reuse.reuseOpportunities, 3);
  strictEqual(reuse.reuseEvents, 2);
  strictEqual(reuse.rate, 2 / 3);
  strictEqual(reuse.reusedCapabilities.length, 2);
  const review = reuse.reusedCapabilities.find((c) => c.capabilityKey === "review-heuristics");
  deepStrictEqual(review?.reusedTaskIds, ["task-001", "task-002"]);
  deepStrictEqual(reuse.visibleNonAutomatedTaskIds, ["task-003", "task-004"]);
});

test("computeCapabilityReuseRate rejects inconsistent W031/W032 refs per capability", () => {
  throws(
    () =>
      computeCapabilityReuseRate(
        "reuse-002",
        family,
        [
          capabilityReuseObservation({
            taskId: "task-001",
            familyRef,
            capabilityKey: "review-heuristics",
            reused: true,
            reproductionRef: r1,
            learningRef: l1,
          }),
          capabilityReuseObservation({
            taskId: "task-002",
            familyRef,
            capabilityKey: "review-heuristics",
            reused: false,
            reproductionRef: r2,
            learningRef: l1,
          }),
        ],
        executions,
      ),
    TypeError,
  );
});
