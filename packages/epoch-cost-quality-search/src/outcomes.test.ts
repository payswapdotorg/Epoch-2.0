import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computePredictionsDigest,
  computeVariances,
  outcomeRecordDigest,
  verifyPredictionsDigest,
  type ActualVersusPredicted,
  type MetricReading,
} from "./index.js";

const predictions: readonly MetricReading[] = [
  { metricId: "m2", value: 100, unit: "ms", direction: "minimize", basis: "capability-declaration" },
  { metricId: "m1", value: 0.1, unit: "ms", direction: "minimize", basis: "capability-declaration" },
  { metricId: "m3", value: 5, unit: "ms", direction: "minimize", basis: "capability-declaration" },
  { metricId: "m4", value: 7, unit: "ms", direction: "minimize", basis: "capability-declaration" },
];

const record: ActualVersusPredicted = {
  recordId: "rec-1",
  candidateId: "cand-a",
  worldRevision: { worldId: "world-1", revisionDigest: "d".repeat(64) },
  predictions,
  predictionsDigest: computePredictionsDigest(predictions),
  actuals: [
    { metricId: "m1", actualValue: 0.3, unit: "ms", measuredDate: "2026-03-01", source: "prod telemetry" },
    { metricId: "m2", actualValue: 100, unit: "ms", measuredDate: "2026-03-01", source: "prod telemetry" },
    { metricId: "m4", actualValue: 9, unit: "s", measuredDate: "2026-03-01", source: "prod telemetry" },
    { metricId: "m9", actualValue: 1, unit: "ms", measuredDate: "2026-03-01", source: "prod telemetry" },
  ],
  recordedDate: "2026-03-02",
};

describe("computeVariances", () => {
  it("computes signed and relative variance without rounding", () => {
    const result = computeVariances(record);
    assert.deepEqual(
      result.variances.map((variance) => variance.metricId),
      ["m1", "m2"],
    );
    const first = result.variances[0];
    assert.equal(first.predicted, 0.1);
    assert.equal(first.actual, 0.3);
    assert.equal(first.delta, 0.3 - 0.1);
    assert.equal(first.relativeDelta, (0.3 - 0.1) / Math.abs(0.1));
    const second = result.variances[1];
    assert.equal(second.delta, 0);
    assert.equal(second.relativeDelta, 0);
  });

  it("reports unit mismatches, missing actuals and unmatched actuals as typed lists", () => {
    const result = computeVariances(record);
    assert.deepEqual(result.unitMismatches, [
      { metricId: "m4", predictedUnit: "ms", actualUnit: "s" },
    ]);
    assert.deepEqual(result.missingActuals, ["m3"]);
    assert.deepEqual(result.unmatchedActuals, ["m9"]);
  });

  it("returns null relative delta when the prediction is zero", () => {
    const zeroRecord: ActualVersusPredicted = {
      ...record,
      predictions: [
        { metricId: "m0", value: 0, unit: "ms", direction: "minimize", basis: "capability-declaration" },
      ],
      actuals: [
        { metricId: "m0", actualValue: 5, unit: "ms", measuredDate: "2026-03-01", source: "prod telemetry" },
      ],
    };
    const result = computeVariances(zeroRecord);
    assert.equal(result.variances.length, 1);
    assert.equal(result.variances[0].delta, 5);
    assert.equal(result.variances[0].relativeDelta, null);
  });
});

describe("computePredictionsDigest", () => {
  it("digests predictions in canonical metric order", () => {
    assert.equal(
      computePredictionsDigest(predictions),
      computePredictionsDigest([...predictions].reverse()),
    );
    assert.notEqual(
      computePredictionsDigest(predictions),
      computePredictionsDigest(predictions.slice(0, 2)),
    );
  });
});

describe("outcomeRecordDigest", () => {
  it("versions outcome records against their predictions digest", () => {
    assert.equal(outcomeRecordDigest(record), outcomeRecordDigest(record));
    const tampered = { ...record, predictionsDigest: "f".repeat(64) };
    assert.notEqual(outcomeRecordDigest(tampered), outcomeRecordDigest(record));
    assert.equal(verifyPredictionsDigest(record), true);
    assert.equal(verifyPredictionsDigest(tampered), false);
  });
});
