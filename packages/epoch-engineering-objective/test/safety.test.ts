import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";
import {
  safetyRegressionMeasure,
  summarizeSafetyRegressions,
} from "../src/build/safety.js";
import { taskFamilyRef } from "../src/build/denominators.js";
import type { SafetyRegressionStatus } from "../src/types/safety.js";
import { sha256Hex } from "../src/canonical.js";

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const family = taskFamilyRef("engineering-automation", "1.0.0");

function measure(
  status: SafetyRegressionStatus,
  taskId: string | null,
  constraintId: string,
  refFamily = familyRef
) {
  return safetyRegressionMeasure({
    measureId: `safety-${constraintId}`,
    familyRef: refFamily,
    taskId,
    hardConstraintId: constraintId,
    status,
    frontierRef: { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("frontier-1") },
    evidenceRefs: [{ namespace: "epoch-lifecycle:evidence", digest: sha256Hex("safety-evidence") }],
  });
}

test("safetyRegressionMeasure builds with a stable digest and validates status", () => {
  const built = measure("regression", "task-001", "no-execution-authority");
  strictEqual(
    built.measureDigest,
    measure("regression", "task-001", "no-execution-authority").measureDigest
  );
  throws(() => measure("exploded" as unknown as SafetyRegressionStatus, null, "c"), TypeError);
});

test("safetyRegressionMeasure requires evidence", () => {
  throws(
    () =>
      safetyRegressionMeasure({
        measureId: "s-1",
        familyRef,
        taskId: null,
        hardConstraintId: "c",
        status: "unknown",
        frontierRef: { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("f") },
        evidenceRefs: [],
      }),
    TypeError
  );
});

test("summarizeSafetyRegressions counts statuses and dedupes visible ids", () => {
  const summary = summarizeSafetyRegressions(
    [
      measure("regression", "task-001", "no-execution-authority"),
      measure("regression", "task-001", "read-only-measurement"),
      measure("no-regression", "task-002", "no-execution-authority"),
      measure("unknown", null, "no-second-authority"),
    ],
    family
  );
  deepStrictEqual(summary, {
    kind: "safety-regression-summary",
    familyRef: family,
    total: 4,
    regressions: 2,
    noRegression: 1,
    unknown: 1,
    regressionTaskIds: ["task-001"],
    regressionConstraintIds: ["no-execution-authority", "read-only-measurement"],
    hasRegressions: true,
  });
});

test("summarizeSafetyRegressions scopes by family and keeps regressions visible", () => {
  const foreign = measure("regression", "task-900", "foreign-constraint", {
    familyId: "other-family",
    version: "1.0.0",
  });
  const scoped = summarizeSafetyRegressions(
    [foreign, measure("no-regression", "task-001", "c")],
    family
  );
  strictEqual(scoped.total, 1);
  strictEqual(scoped.hasRegressions, false);
  const unscoped = summarizeSafetyRegressions([foreign], null);
  strictEqual(unscoped.total, 1);
  strictEqual(unscoped.hasRegressions, true);
  ok(unscoped.regressionTaskIds.includes("task-900"));
});
