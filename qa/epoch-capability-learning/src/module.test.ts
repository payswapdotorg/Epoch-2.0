import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import * as epoch from "../../packages/epoch-capability-learning/dist/index.js";

test("the manifest declares no execution authority and digest-only dependencies", () => {
  strictEqual(epoch.moduleManifest.moduleId, "epoch-capability-learning");
  strictEqual(epoch.moduleManifest.authority.execution, "none");
  deepStrictEqual(
    epoch.moduleManifest.dependencies.map((dependency) => dependency.mode),
    ["digest-reference", "digest-reference", "digest-reference"],
  );
  const laws = epoch.moduleManifest.laws.map((law) => law.law);
  ok(laws.includes("hash-law"));
  ok(laws.includes("no-execution-authority"));
  ok(laws.includes("human-in-the-loop-law"));
  deepStrictEqual(epoch.moduleManifest.ownership, [
    "packages/epoch-capability-learning/**",
    "qa/epoch-capability-learning/**",
  ]);
});

test("the autonomy ladder climbs one rung at a time", () => {
  deepStrictEqual(
    epoch.AUTONOMY_LADDER.map((descriptor) => descriptor.rung),
    [0, 1, 2, 3],
  );
  deepStrictEqual(
    epoch.AUTONOMY_LADDER.map((descriptor) => descriptor.level),
    ["proposal-only", "supervised", "observed", "autonomous"],
  );
  for (const descriptor of epoch.AUTONOMY_LADDER) {
    if (descriptor.rung > 0) {
      strictEqual(descriptor.requiresRegressionWatch, true);
    }
  }
  const top = epoch.AUTONOMY_LADDER[3];
  ok(top !== undefined);
  strictEqual(top.requiredBasis, "measured-evidence-and-regression-history");
});

test("the contract exports the governed public surface", () => {
  const functions = [
    epoch.classifyGap,
    epoch.recordGap,
    epoch.extractLearningCandidate,
    epoch.reviseCandidate,
    epoch.validateGeneralization,
    epoch.applyGeneralization,
    epoch.declareScope,
    epoch.authorizeReuse,
    epoch.defineReusePolicy,
    epoch.proposePromotion,
    epoch.approvePromotion,
    epoch.establishRegressionWatch,
    epoch.evaluateRegression,
    epoch.defineMeasurementSnapshot,
    epoch.interventionCostUnits,
  ];
  for (const exportedFunction of functions) {
    strictEqual(typeof exportedFunction, "function");
  }
  strictEqual(typeof epoch.GAP_ROUTING_RULES, "object");
  strictEqual(typeof epoch.AUTONOMY_LADDER, "object");
  strictEqual(typeof epoch.REUSE_LEVEL_RIGHTS, "object");
  strictEqual(typeof epoch.moduleManifest, "object");
});
