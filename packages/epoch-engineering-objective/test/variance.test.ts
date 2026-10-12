import { test } from "node:test";
import { ok, strictEqual, throws } from "node:assert";
import { evaluateAbundanceClaim, predictionVarianceRecord } from "../src/build/variance.js";
import { qualityMetric } from "../src/build/completion.js";
import { monetaryCost, qualityAcceptanceThreshold } from "../src/types/core.js";
import type { VerifiedQualityMetric } from "../src/types/completion.js";
import { sha256Hex } from "../src/canonical.js";

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const acceptance = qualityAcceptanceThreshold(0.8);
const frontierRef = { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("frontier-1") };
const solutionRef = { namespace: "epoch-capability-reproduction:record", digest: sha256Hex("solution-1") };

const verified = qualityMetric({
  metricId: "quality-001",
  familyRef,
  taskId: "task-001",
  measuredAt: "2025-01-15T10:05:00Z",
  verification: {
    status: "verified",
    batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("battery-1") },
    qualityScore: 0.9,
  },
});
const lowVerified = qualityMetric({
  metricId: "quality-003",
  familyRef,
  taskId: "task-001",
  measuredAt: "2025-01-15T10:05:00Z",
  verification: {
    status: "verified",
    batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("battery-1") },
    qualityScore: 0.5,
  },
});
const unverified = qualityMetric({
  metricId: "quality-002",
  familyRef,
  taskId: "task-001",
  measuredAt: "2025-01-15T10:05:00Z",
  verification: { status: "unverified" },
});

interface RecordOptions {
  feasible?: boolean;
  predictedMinorUnits?: number | null;
  actualMinorUnits?: number | null;
  actualCurrency?: string;
  quality?: VerifiedQualityMetric | null;
}

function record(input: RecordOptions = {}) {
  return predictionVarianceRecord({
    varianceId: "variance-001",
    familyRef,
    taskId: "task-001",
    predicted: {
      monetaryCost:
        input.predictedMinorUnits === null || input.predictedMinorUnits === undefined
          ? null
          : monetaryCost("USD", input.predictedMinorUnits),
      duration: null,
      predictedQualityScore: 0.9,
      frontierRef,
    },
    actual: {
      monetaryCost:
        input.actualMinorUnits === null || input.actualMinorUnits === undefined
          ? null
          : monetaryCost(input.actualCurrency ?? "USD", input.actualMinorUnits),
      duration: null,
      verifiedQuality: input.quality === undefined ? verified : input.quality,
    },
    feasibility:
      input.feasible === false
        ? { feasible: false, reason: "no feasible solution within the hard constraints" }
        : { feasible: true, solutionRef, note: "solution reproduced and verified" },
  });
}

function blockReason(value: { kind: string; reason?: unknown }): string {
  strictEqual(value.kind, "no-claim");
  return String(value.reason);
}

test("predictionVarianceRecord builds with a stable digest", () => {
  strictEqual(record().recordDigest, record().recordDigest);
  ok(/^[0-9a-f]{64}$/.test(record().recordDigest));
});

test("infeasible solutions never yield claims", () => {
  strictEqual(blockReason(evaluateAbundanceClaim(record({ feasible: false }), acceptance)), "infeasible-solution");
});

test("a missing cost prediction blocks the claim", () => {
  strictEqual(
    blockReason(evaluateAbundanceClaim(record({ predictedMinorUnits: null }), acceptance)),
    "no-cost-prediction"
  );
});

test("a missing actual cost or a currency mismatch blocks the claim", () => {
  strictEqual(
    blockReason(evaluateAbundanceClaim(record({ actualMinorUnits: null }), acceptance)),
    "no-cost-actual"
  );
  strictEqual(
    blockReason(
      evaluateAbundanceClaim(
        record({ predictedMinorUnits: 1000, actualMinorUnits: 700, actualCurrency: "EUR" }),
        acceptance
      )
    ),
    "currency-mismatch"
  );
});

test("an actual cost that is not lower blocks the claim", () => {
  strictEqual(
    blockReason(evaluateAbundanceClaim(record({ predictedMinorUnits: 700, actualMinorUnits: 700 }), acceptance)),
    "actual-not-lower"
  );
});

test("unverified actual quality blocks the claim", () => {
  strictEqual(
    blockReason(evaluateAbundanceClaim(record({ quality: unverified }), acceptance)),
    "quality-unverified"
  );
  strictEqual(
    blockReason(evaluateAbundanceClaim(record({ quality: null }), acceptance)),
    "quality-unverified"
  );
});

test("verified quality below the threshold blocks the claim", () => {
  strictEqual(
    blockReason(evaluateAbundanceClaim(record({ quality: lowVerified }), acceptance)),
    "quality-below-threshold"
  );
});

test("feasible + verified + actually cheaper yields a typed lower-cost claim", () => {
  const claim = evaluateAbundanceClaim(record(), acceptance);
  strictEqual(claim.kind, "lower-cost-claim");
  if (claim.kind === "lower-cost-claim") {
    strictEqual(claim.claimedReductionMinorUnits, 300);
    strictEqual(claim.currencyCode, "USD");
    strictEqual(claim.verifiedQualityScore, 0.9);
    strictEqual(
      claim.law,
      "lower-cost-claimed-only-for-feasible-solutions-with-verified-quality"
    );
  }
  throws(() => record({ quality: unverified, predictedMinorUnits: -1 as unknown as number }), TypeError);
});
