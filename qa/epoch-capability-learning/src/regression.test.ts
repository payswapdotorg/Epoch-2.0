import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import {
  defineMeasurementSnapshot,
  establishRegressionWatch,
  evaluateRegression,
  interventionCostUnits,
} from "../../../packages/epoch-capability-learning/dist/index.js";
import type {
  PromotionRef,
  RegressionFinding,
  RollbackTrigger,
} from "../../../packages/epoch-capability-learning/dist/index.js";
import { generalizingCandidate, hex, makeSnapshot } from "./helpers.js";

const promotionRef: PromotionRef = {
  promotionId: hex("promotion-001"),
  candidateId: generalizingCandidate().candidateId,
  approvedLevel: "supervised",
};

const semantics = hex("w030-regression-semantics-001");

function makeWatch(triggers: readonly RollbackTrigger[] = []) {
  const result = establishRegressionWatch({
    promotion: promotionRef,
    before: makeSnapshot({}),
    triggers,
    evaluationSemanticsRef: semantics,
  });
  if (result.kind !== "established") {
    throw new Error(`fixture watch rejected: ${result.reason}`);
  }
  return result.watch;
}

test("establishes a digest-versioned watch", () => {
  const watch = makeWatch([{ metric: "quality", comparator: "drops-below", threshold: 0.5 }]);
  ok(/^[0-9a-f]{64}$/.test(watch.watchId));
  strictEqual(watch.promotion.promotionId, promotionRef.promotionId);
  strictEqual(watch.before.snapshotDigest, makeSnapshot({}).snapshotDigest);
  strictEqual(watch.evaluationSemanticsRef, semantics);
  deepStrictEqual(watch.triggers, [
    { metric: "quality", comparator: "drops-below", threshold: 0.5 },
  ]);
});

test("rejects malformed watch references", () => {
  const badPromotion = establishRegressionWatch({
    promotion: { ...promotionRef, promotionId: "nope" },
    before: makeSnapshot({}),
    triggers: [],
    evaluationSemanticsRef: semantics,
  });
  ok(badPromotion.kind === "rejected");
  strictEqual(badPromotion.reason, "invalid-promotion-reference");
  const badSemantics = establishRegressionWatch({
    promotion: promotionRef,
    before: makeSnapshot({}),
    triggers: [],
    evaluationSemanticsRef: "w030/semantics",
  });
  ok(badSemantics.kind === "rejected");
  strictEqual(badSemantics.reason, "missing-evaluation-semantics-reference");
});

test("weights expert escalations above routine interventions", () => {
  strictEqual(
    interventionCostUnits({
      routineInterventions: 2,
      expertEscalations: 1,
      meanStepsPerEpisode: 3,
    }),
    7,
  );
  strictEqual(
    interventionCostUnits({
      routineInterventions: 0,
      expertEscalations: 4,
      meanStepsPerEpisode: 3,
    }),
    20,
  );
});

test("detects a quality regression beyond tolerance", () => {
  const reading = evaluateRegression(makeWatch(), makeSnapshot({ qualityScore: 0.4 }));
  strictEqual(reading.verdict, "regressed");
  const quality = reading.comparison.findings.find(
    (finding: RegressionFinding) => finding.metric === "quality",
  );
  ok(quality !== undefined);
  strictEqual(quality.severity, "regression");
  strictEqual(reading.rollbackSignal.rollbackAdvised, true);
  strictEqual(reading.rollbackSignal.requiresHumanDecision, true);
  strictEqual(reading.rollbackSignal.advisoryOnly, true);
  ok(/^[0-9a-f]{64}$/.test(reading.readingDigest));
});

test("detects a safety regression and incident increase", () => {
  const reading = evaluateRegression(
    makeWatch(),
    makeSnapshot({ safetyScore: 0.5, incidents: 3 }),
  );
  strictEqual(reading.verdict, "regressed");
  strictEqual(reading.comparison.safetyIncidentsIncreased, true);
  const safety = reading.comparison.findings.find(
    (finding: RegressionFinding) => finding.metric === "safety",
  );
  ok(safety !== undefined);
  strictEqual(safety.severity, "regression");
});

test("detects an intervention-cost regression", () => {
  const reading = evaluateRegression(makeWatch(), makeSnapshot({ routine: 10, expert: 4 }));
  strictEqual(reading.verdict, "regressed");
  strictEqual(reading.comparison.interventionCostDelta, 23);
  const cost = reading.comparison.findings.find(
    (finding: RegressionFinding) => finding.metric === "intervention-cost",
  );
  ok(cost !== undefined);
  strictEqual(cost.severity, "regression");
});

test("reports stable within tolerances", () => {
  const reading = evaluateRegression(
    makeWatch(),
    makeSnapshot({ qualityScore: 0.81, safetyScore: 0.985 }),
  );
  strictEqual(reading.verdict, "stable");
  strictEqual(reading.comparison.qualification, "unchanged");
  strictEqual(reading.rollbackSignal.rollbackAdvised, false);
  deepStrictEqual(reading.rollbackSignal.triggeredTriggers, []);
});

test("reports improvement when quality rises beyond tolerance", () => {
  const reading = evaluateRegression(makeWatch(), makeSnapshot({ qualityScore: 0.95 }));
  strictEqual(reading.verdict, "improved");
  strictEqual(reading.rollbackSignal.rollbackAdvised, false);
});

test("degraded qualification regresses the verdict even within tolerances", () => {
  const reading = evaluateRegression(
    makeWatch(),
    makeSnapshot({ qualityScore: 0.81, qualified: false }),
  );
  strictEqual(reading.verdict, "regressed");
  strictEqual(reading.comparison.qualification, "degraded");
  strictEqual(reading.rollbackSignal.rollbackAdvised, true);
});

test("an explicit trigger advises rollback independently of the verdict", () => {
  const watch = makeWatch([{ metric: "quality", comparator: "drops-below", threshold: 0.85 }]);
  const reading = evaluateRegression(watch, makeSnapshot({ qualityScore: 0.81 }));
  strictEqual(reading.verdict, "stable");
  strictEqual(reading.rollbackSignal.rollbackAdvised, true);
  strictEqual(reading.rollbackSignal.triggeredTriggers.length, 1);
});

test("defineMeasurementSnapshot rejects malformed readings", () => {
  const base = {
    epochRef: "epoch-e03",
    evaluation: { decisionDigest: hex("w030-decision-002"), outcome: "qualified" as const },
    quality: { score: 0.8, benchmarkRef: "bench/quality-v1", sampleCount: 12 },
    safety: { score: 0.99, incidents: 0, evidenceDigest: hex("safety-evidence-002") },
    interventionCost: { routineInterventions: 1, expertEscalations: 0, meanStepsPerEpisode: 3 },
    measurementBasis: "observation window",
  };
  const invalidDigest = defineMeasurementSnapshot({
    ...base,
    evaluation: { decisionDigest: "short", outcome: "qualified" },
  });
  ok(invalidDigest.kind === "rejected");
  strictEqual(invalidDigest.reason, "invalid-evaluation-reference");
  const outOfRange = defineMeasurementSnapshot({
    ...base,
    quality: { score: 1.5, benchmarkRef: "bench/quality-v1", sampleCount: 12 },
  });
  ok(outOfRange.kind === "rejected");
  strictEqual(outOfRange.reason, "score-out-of-range");
  const negative = defineMeasurementSnapshot({
    ...base,
    safety: { score: 0.99, incidents: -1, evidenceDigest: hex("safety-evidence-002") },
  });
  ok(negative.kind === "rejected");
  strictEqual(negative.reason, "negative-count");
  const noEpoch = defineMeasurementSnapshot({ ...base, epochRef: " " });
  ok(noEpoch.kind === "rejected");
  strictEqual(noEpoch.reason, "missing-epoch-reference");
});
