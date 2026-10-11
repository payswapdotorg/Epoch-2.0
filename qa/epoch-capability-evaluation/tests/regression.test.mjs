import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRegression } from "./under-test.mjs";
import {
  M_AGREE,
  M_COVER,
  M_FAIL,
  M_LAT,
  M_PASS,
  cutFixture,
  descriptorFixture,
  measurement,
  referenceFixture,
  run,
} from "./fixtures.mjs";

test("identical results report no regression and no drift", () => {
  const descriptor = descriptorFixture();
  const reference = referenceFixture();
  const first = run(descriptor, cutFixture(), reference);
  const second = run(descriptor, cutFixture(), reference);
  assert.deepEqual(first, second);
  const report = detectRegression(first, second);
  assert.equal(report.regressionDetected, false);
  assert.equal(report.driftDetected, false);
  assert.equal(report.statusRegression, false);
  assert.deepEqual(report.newHardConstraintViolations, []);
});

test("metric worsening beyond tolerance is reported as regression", () => {
  const descriptor = descriptorFixture();
  const previous = run(descriptor, cutFixture(), referenceFixture());
  const worsened = run(
    descriptor,
    cutFixture({
      measurements: [
        measurement(M_PASS, 0.97),
        measurement(M_AGREE, 0.93),
        measurement(M_COVER, 0.99),
        measurement(M_FAIL, 0.005),
        measurement(M_LAT, 230),
      ],
    }),
    referenceFixture(),
  );
  const report = detectRegression(previous, worsened);
  assert.equal(report.regressionDetected, true);
  const latency = report.metricRegressions.find((regression) => regression.metricId === M_LAT);
  assert.ok(latency);
  assert.equal(latency.exceededTolerance, true);
  assert.equal(latency.improvement, -20);
  assert.equal(report.statusRegression, false);
});

test("metric worsening within tolerance is not a regression", () => {
  const descriptor = descriptorFixture();
  const previous = run(descriptor, cutFixture(), referenceFixture());
  const current = run(
    descriptor,
    cutFixture({
      measurements: [
        measurement(M_PASS, 0.97),
        measurement(M_AGREE, 0.93),
        measurement(M_COVER, 0.99),
        measurement(M_FAIL, 0.005),
        measurement(M_LAT, 212),
      ],
    }),
    referenceFixture(),
  );
  const report = detectRegression(previous, current);
  assert.equal(report.regressionDetected, false);
  const latency = report.metricRegressions.find((regression) => regression.metricId === M_LAT);
  assert.ok(latency);
  assert.equal(latency.exceededTolerance, false);
});

test("new hard-constraint violations are regressions", () => {
  const descriptor = descriptorFixture();
  const previous = run(descriptor, cutFixture(), referenceFixture());
  const current = run(
    descriptor,
    cutFixture({
      measurements: [
        measurement(M_PASS, 0.97),
        measurement(M_AGREE, 0.93),
        measurement(M_COVER, 0.99),
        measurement(M_FAIL, 0.03),
        measurement(M_LAT, 210),
      ],
    }),
    referenceFixture(),
  );
  const report = detectRegression(previous, current);
  assert.deepEqual(report.newHardConstraintViolations, [M_FAIL]);
  assert.equal(report.regressionDetected, true);
});

test("status drops are regressions", () => {
  const descriptor = descriptorFixture();
  const previous = run(descriptor, cutFixture({ currentStatus: "reference-comparable" }), referenceFixture());
  const current = run(
    descriptor,
    cutFixture({
      currentStatus: "reference-comparable",
      measurements: [
        measurement(M_PASS, 0.93),
        measurement(M_AGREE, 0.93),
        measurement(M_COVER, 0.99),
        measurement(M_FAIL, 0.005),
        measurement(M_LAT, 210),
      ],
    }),
    referenceFixture(),
  );
  const report = detectRegression(previous, current);
  assert.equal(report.statusRegression, true);
  assert.equal(report.regressionDetected, true);
});

test("drift is detected when the same capability declaration yields a different result digest", () => {
  const descriptor = descriptorFixture();
  const cut = cutFixture();
  const referenceA = referenceFixture();
  const referenceB = referenceFixture({
    measurements: [
      measurement(M_PASS, 0.971),
      measurement(M_AGREE, 0.921),
      measurement(M_COVER, 0.995),
      measurement(M_FAIL, 0.004),
      measurement(M_LAT, 200),
    ],
  });
  const first = run(descriptor, cut, referenceA);
  const second = run(descriptor, cut, referenceB);
  assert.equal(first.capabilityDigest, second.capabilityDigest);
  assert.notEqual(first.resultDigest, second.resultDigest);
  const report = detectRegression(first, second);
  assert.equal(report.sameCapabilityDeclaration, true);
  assert.equal(report.driftDetected, true);
  assert.equal(report.regressionDetected, false);
});

test("metric comparison is skipped across different benchmarks", () => {
  const cut = cutFixture();
  const first = run(descriptorFixture(), cut, referenceFixture());
  const second = run(descriptorFixture({ version: 3 }), cut, referenceFixture({ benchmarkVersion: 3 }));
  const report = detectRegression(first, second);
  assert.equal(report.sameBenchmark, false);
  assert.deepEqual(report.metricRegressions, []);
  assert.ok(report.rationale.some((line) => line.startsWith("benchmark-changed:")));
});
