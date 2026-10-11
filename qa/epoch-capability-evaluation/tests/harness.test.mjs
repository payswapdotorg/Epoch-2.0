import { test } from "node:test";
import assert from "node:assert/strict";
import { runBenchmark, verifyResultDigest } from "./under-test.mjs";
import {
  DIGEST_A,
  DIGEST_B,
  DIGEST_C,
  DIGEST_D,
  DIGEST_E,
  M_AGREE,
  M_COVER,
  M_FAIL,
  M_LAT,
  M_MEM,
  M_PASS,
  cutFixture,
  descriptorFixture,
  measurement,
  referenceFixture,
  run,
  severeLimitFixture,
} from "./fixtures.mjs";

test("promotes a passing prototype to named-task-qualified", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  assert.equal(result.decision.from, "prototype");
  assert.equal(result.decision.to, "named-task-qualified");
  assert.equal(result.decision.direction, "promotion");
  assert.equal(result.decision.qualifiedForRelease, true);
  assert.deepEqual(result.outcomeCounts, {
    passed: 5,
    failed: 0,
    notEvaluated: 0,
  });
  assert.deepEqual(result.decision.evidenceRefs, [
    DIGEST_A,
    DIGEST_B,
    DIGEST_C,
    DIGEST_D,
    DIGEST_E,
  ]);
});

test("clamps promotion to one rung even when every differential is superior", () => {
  const reference = referenceFixture({
    measurements: [
      measurement(M_PASS, 0.94),
      measurement(M_AGREE, 0.92),
      measurement(M_COVER, 0.995),
      measurement(M_FAIL, 0.004),
      measurement(M_LAT, 200),
    ],
  });
  const cut = cutFixture({
    measurements: [
      measurement(M_PASS, 0.99),
      measurement(M_AGREE, 0.98),
      measurement(M_COVER, 0.99),
      measurement(M_FAIL, 0.005),
      measurement(M_LAT, 210),
    ],
  });
  const result = run(descriptorFixture(), cut, reference);
  assert.equal(result.decision.to, "named-task-qualified");
  assert.equal(result.decision.direction, "promotion");
  for (const outcome of result.metricOutcomes) {
    if (
      outcome.differential !== null &&
      outcome.metricId !== M_PASS &&
      outcome.metricId !== M_AGREE
    ) {
      assert.fail("unexpected differential metric");
    }
  }
  const pass = result.metricOutcomes.find(
    (outcome) => outcome.metricId === M_PASS,
  );
  assert.equal(pass.differential, "superior");
});

test("a hard-constraint violation never qualifies and demotes one rung", () => {
  const cut = cutFixture({
    currentStatus: "named-task-qualified",
    measurements: [
      measurement(M_PASS, 0.99),
      measurement(M_AGREE, 0.99),
      measurement(M_COVER, 0.99),
      measurement(M_FAIL, 0.03),
      measurement(M_LAT, 210),
    ],
  });
  const result = run(descriptorFixture(), cut, referenceFixture());
  assert.deepEqual(result.decision.hardConstraintViolations, [M_FAIL]);
  assert.equal(result.decision.qualifiedForRelease, false);
  assert.equal(result.decision.to, "prototype");
  assert.equal(result.decision.direction, "regression");
});

test("a failed threshold blocks promotion without a hard-constraint violation", () => {
  const cut = cutFixture({
    measurements: [
      measurement(M_PASS, 0.97),
      measurement(M_AGREE, 0.93),
      measurement(M_COVER, 0.99),
      measurement(M_FAIL, 0.015),
      measurement(M_LAT, 210),
    ],
  });
  const result = run(descriptorFixture(), cut, referenceFixture());
  assert.deepEqual(result.decision.hardConstraintViolations, []);
  assert.deepEqual(result.decision.failedMetricIds, [M_FAIL]);
  assert.equal(result.decision.qualifiedForRelease, false);
  assert.equal(result.decision.to, "prototype");
  assert.equal(result.decision.direction, "hold");
});

test("missing measurement evidence holds promotion when evidence is required", () => {
  const cut = cutFixture({
    measurements: [
      measurement(M_PASS, 0.97),
      measurement(M_AGREE, 0.93),
      { metricId: M_COVER, value: 0.99, samples: 30 },
      measurement(M_FAIL, 0.005),
      measurement(M_LAT, 210),
    ],
  });
  const result = run(descriptorFixture(), cut, referenceFixture());
  assert.deepEqual(result.outcomeCounts, {
    passed: 5,
    failed: 0,
    notEvaluated: 0,
  });
  assert.equal(result.decision.direction, "hold");
  assert.equal(result.decision.to, "prototype");
  assert.equal(result.decision.qualifiedForRelease, false);
});

test("named-task-qualified with comparable differentials promotes to reference-comparable", () => {
  const cut = cutFixture({ currentStatus: "named-task-qualified" });
  const result = run(descriptorFixture(), cut, referenceFixture());
  assert.equal(result.decision.to, "reference-comparable");
  assert.equal(result.decision.direction, "promotion");
});

test("reference-comparable with all-superior differentials promotes to reference-superior", () => {
  const reference = referenceFixture({
    measurements: [
      measurement(M_PASS, 0.94),
      measurement(M_AGREE, 0.92),
      measurement(M_COVER, 0.995),
      measurement(M_FAIL, 0.004),
      measurement(M_LAT, 200),
    ],
  });
  const cut = cutFixture({
    currentStatus: "reference-comparable",
    measurements: [
      measurement(M_PASS, 0.99),
      measurement(M_AGREE, 0.98),
      measurement(M_COVER, 0.99),
      measurement(M_FAIL, 0.005),
      measurement(M_LAT, 210),
    ],
  });
  const result = run(descriptorFixture(), cut, reference);
  assert.equal(result.decision.to, "reference-superior");
  assert.equal(result.decision.direction, "promotion");
});

test("inferior differentials demote one rung even when all thresholds pass", () => {
  const base = descriptorFixture();
  const descriptor = descriptorFixture({
    metricSelections: base.metricSelections.map((selection) => {
      if (selection.metricId === M_PASS) {
        return { ...selection, qualificationThreshold: 0.9 };
      }
      if (selection.metricId === M_AGREE) {
        return { ...selection, qualificationThreshold: 0.85 };
      }
      return selection;
    }),
  });
  const cut = cutFixture({
    currentStatus: "reference-comparable",
    measurements: [
      measurement(M_PASS, 0.93),
      measurement(M_AGREE, 0.93),
      measurement(M_COVER, 0.99),
      measurement(M_FAIL, 0.005),
      measurement(M_LAT, 210),
    ],
  });
  const result = run(descriptor, cut, referenceFixture());
  assert.deepEqual(result.decision.failedMetricIds, []);
  assert.equal(result.decision.to, "named-task-qualified");
  assert.equal(result.decision.direction, "regression");
});

test("rejects a reference run for a different benchmark", () => {
  const outcome = runBenchmark(
    descriptorFixture(),
    cutFixture(),
    referenceFixture({ benchmarkVersion: 3 }),
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "harness/reference-benchmark-mismatch");
});

test("rejects a capability from a different capability class", () => {
  const outcome = runBenchmark(
    descriptorFixture(),
    cutFixture({ capabilityClass: "rendering" }),
    referenceFixture(),
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "harness/class-mismatch");
});

test("rejects measurements for metrics the benchmark does not select", () => {
  const cut = cutFixture({
    measurements: [...cutFixture().measurements, measurement(M_MEM, 128)],
  });
  const outcome = runBenchmark(descriptorFixture(), cut, referenceFixture());
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "harness/measurement-metric-not-selected");
});

test("rejects differential metrics without reference measurements", () => {
  const base = descriptorFixture();
  const descriptor = descriptorFixture({
    metricSelections: base.metricSelections.map((selection) =>
      selection.metricId === M_COVER
        ? {
            ...selection,
            differential: {
              comparableTolerance: 0.01,
              superiorityMargin: 0.03,
            },
          }
        : selection,
    ),
  });
  const reference = referenceFixture({
    measurements: [
      measurement(M_PASS, 0.96),
      measurement(M_AGREE, 0.92),
      measurement(M_FAIL, 0.004),
      measurement(M_LAT, 200),
    ],
  });
  const outcome = runBenchmark(descriptor, cutFixture(), reference);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "harness/missing-reference-measurement");
});

test("carries known limits into the benchmark result", () => {
  const limit = severeLimitFixture({
    severity: "minor",
    mitigation: "tracked-mitigation",
  });
  const cut = cutFixture({ knownLimits: [limit] });
  const result = run(descriptorFixture(), cut, referenceFixture());
  assert.deepEqual(result.knownLimits, [limit]);
});

test("rejects invalid known limits with a typed error", () => {
  const cut = cutFixture({
    knownLimits: [
      {
        id: "limit/bad",
        scope: "scope",
        affectedMetrics: ["nope/nonsense"],
        severity: "minor",
        mitigation: "none",
        acknowledgedAtEpoch: 1,
      },
    ],
  });
  const outcome = runBenchmark(descriptorFixture(), cut, referenceFixture());
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "harness/invalid-known-limit");
});

test("verifies sealed result digests and detects tampering", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  assert.equal(verifyResultDigest(result), true);
  const tampered = {
    ...result,
    outcomeCounts: { ...result.outcomeCounts, passed: 99 },
  };
  assert.equal(verifyResultDigest(tampered), false);
});
