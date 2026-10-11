import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildImplementationPlan,
  planDigest,
  type ImplementationPlan,
} from "./index.js";

const plan: ImplementationPlan = {
  planId: "plan-1",
  candidateId: "cand-a",
  worldRevision: { worldId: "world-1", revisionDigest: "c".repeat(64) },
  createdDate: "2026-02-10",
  steps: [
    {
      stepId: "step-2",
      description: "verify build",
      verification: [
        {
          commandId: "cmd-tsc",
          role: "typecheck",
          argv: ["pnpm", "--filter", "pkg", "exec", "tsc", "-b"],
          expectedOutcome: "success",
          description: "typecheck",
        },
      ],
    },
    {
      stepId: "step-1",
      description: "verify latency",
      verification: [
        {
          commandId: "cmd-bench",
          role: "benchmark",
          argv: ["pnpm", "bench"],
          expectedOutcome: "threshold",
          threshold: { metric: "p99-ms", op: "<=", bound: 10, unit: "ms" },
          description: "latency gate",
        },
      ],
    },
  ],
};

describe("buildImplementationPlan", () => {
  it("keeps verification commands as data and sorts steps deterministically", () => {
    const intake = buildImplementationPlan(plan);
    assert.deepEqual(intake.issues, []);
    assert.ok(intake.plan !== null);
    assert.equal(intake.plan.steps[0].stepId, "step-1");
    assert.equal(intake.plan.steps[0].verification[0].commandId, "cmd-bench");
    assert.deepEqual(intake.plan.steps[0].verification[0].argv, ["pnpm", "bench"]);
    assert.deepEqual(intake.plan.steps[0].verification[0].threshold, {
      metric: "p99-ms",
      op: "<=",
      bound: 10,
      unit: "ms",
    });
    assert.deepEqual(intake.plan.steps[1].verification[0].argv, [
      "pnpm",
      "--filter",
      "pkg",
      "exec",
      "tsc",
      "-b",
    ]);
  });

  it("validates steps and commands with typed issues", () => {
    const noThreshold = buildImplementationPlan({
      ...plan,
      steps: [
        {
          stepId: "s1",
          description: "gate",
          verification: [
            {
              commandId: "c1",
              role: "test",
              argv: ["pnpm", "test"],
              expectedOutcome: "threshold",
              description: "gate",
            },
          ],
        },
      ],
    });
    assert.ok(noThreshold.plan !== null);
    assert.equal(noThreshold.plan.steps.length, 0);
    assert.equal(noThreshold.issues[0].kind, "invalid-command");
    assert.equal(noThreshold.issues[0].commandId, "c1");

    const duplicateStep = buildImplementationPlan({
      ...plan,
      steps: [plan.steps[0], plan.steps[0]],
    });
    assert.ok(duplicateStep.plan !== null);
    assert.equal(duplicateStep.plan.steps.length, 1);
    assert.deepEqual(duplicateStep.issues, [
      { kind: "duplicate-step-id", stepId: "step-2" },
    ]);

    const badDate = buildImplementationPlan({
      ...plan,
      createdDate: "2026-2-10",
    });
    assert.equal(badDate.plan, null);
    assert.equal(badDate.issues[0].kind, "invalid-plan");
  });
});

describe("planDigest", () => {
  it("is deterministic, order-insensitive and sensitive to command changes", () => {
    const first = buildImplementationPlan(plan).plan;
    const reordered = buildImplementationPlan({
      ...plan,
      steps: [...plan.steps].reverse(),
    }).plan;
    assert.ok(first !== null);
    assert.ok(reordered !== null);
    assert.equal(planDigest(first), planDigest(reordered));

    const mutated = {
      ...first,
      steps: [
        {
          ...first.steps[0],
          verification: [
            {
              ...first.steps[0].verification[0],
              argv: ["pnpm", "bench", "--extra"],
            },
          ],
        },
      ],
    };
    assert.notEqual(planDigest(mutated), planDigest(first));

    const mutatedThreshold = {
      ...first,
      steps: [
        {
          ...first.steps[0],
          verification: [
            {
              ...first.steps[0].verification[0],
              threshold: { metric: "p99-ms", op: "<=", bound: 9, unit: "ms" },
            },
          ],
        },
      ],
    };
    assert.notEqual(planDigest(mutatedThreshold), planDigest(first));
  });
});
