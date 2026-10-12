import { test } from "node:test";
import { ok, strictEqual, throws } from "node:assert";
import {
  baselineMeasure,
  evaluateInterventionProgress,
  interventionMeasure,
} from "../src/build/measures.js";
import { qualityMetric } from "../src/build/completion.js";
import { safetyRegressionMeasure } from "../src/build/safety.js";
import { monetaryCost, qualityAcceptanceThreshold } from "../src/types/core.js";
import { sha256Hex } from "../src/canonical.js";

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const acceptance = qualityAcceptanceThreshold(0.8);
const provenance = [
  { namespace: "epoch-lifecycle:evidence", digest: sha256Hex("baseline-provenance") },
];

function baseline(overrides: { familyId?: string; interventionCount?: number | null } = {}) {
  return baselineMeasure({
    baselineId: "baseline-001",
    familyRef: { familyId: overrides.familyId ?? familyRef.familyId, version: "1.0.0" },
    scope: { scope: "task", taskId: "task-001" },
    interventionCount: overrides.interventionCount === undefined ? 3 : overrides.interventionCount,
    monetaryCost: null,
    duration: null,
    provenance,
  });
}

function intervention(count: number) {
  return interventionMeasure({
    interventionId: "intervention-001",
    familyRef,
    taskId: "task-001",
    interventionCount: count,
    monetaryCost: null,
    duration: null,
    learningRef: {
      namespace: "epoch-capability-learning:intervention",
      digest: sha256Hex("learning-001"),
    },
  });
}

function metric(score: number, taskId = "task-001") {
  return qualityMetric({
    metricId: `quality-${taskId}`,
    familyRef,
    taskId,
    measuredAt: "2025-01-15T10:05:00Z",
    verification: {
      status: "verified",
      batteryRecordRef: {
        namespace: "epoch-verification:battery",
        digest: sha256Hex("battery-001"),
      },
      qualityScore: score,
    },
  });
}

function regression(taskId: string | null) {
  return safetyRegressionMeasure({
    measureId: "safety-001",
    familyRef,
    taskId,
    hardConstraintId: "no-execution-authority",
    status: "regression",
    frontierRef: {
      namespace: "epoch-cost-quality-search:outcome",
      digest: sha256Hex("frontier-001"),
    },
    evidenceRefs: [{ namespace: "epoch-lifecycle:evidence", digest: sha256Hex("safety-evidence") }],
  });
}

function gate(
  options: {
    baseline?: ReturnType<typeof baseline> | null;
    quality?: ReturnType<typeof metric> | null;
    count?: number;
    regressions?: ReturnType<typeof regression>[];
  } = {},
) {
  return evaluateInterventionProgress({
    intervention: intervention(options.count ?? 1),
    baseline: options.baseline === undefined ? baseline() : options.baseline,
    pairedQuality: options.quality === undefined ? metric(0.9) : options.quality,
    acceptance,
    safetyRegressions: options.regressions ?? [],
  });
}

function notQualifyingReason(value: { kind: string; reason?: unknown }): string {
  strictEqual(value.kind, "not-qualifying");
  return String(value.reason);
}

test("baselineMeasure requires provenance", () => {
  throws(
    () =>
      baselineMeasure({
        baselineId: "b",
        familyRef,
        scope: { scope: "task-family" },
        interventionCount: 3,
        monetaryCost: null,
        duration: null,
        provenance: [],
      }),
    TypeError,
  );
});

test("baselineMeasure requires at least one measured quantity", () => {
  throws(
    () =>
      baselineMeasure({
        baselineId: "b",
        familyRef,
        scope: { scope: "task-family" },
        interventionCount: null,
        monetaryCost: null,
        duration: null,
        provenance,
      }),
    TypeError,
  );
});

test("interventionMeasure builds with a stable digest and validates the learning ref", () => {
  strictEqual(intervention(1).measureDigest, intervention(1).measureDigest);
  throws(
    () =>
      interventionMeasure({
        interventionId: "intervention-002",
        familyRef,
        taskId: "task-001",
        interventionCount: 1,
        monetaryCost: null,
        duration: null,
        learningRef: {
          namespace: "epoch-capability-learning:intervention",
          digest: "not-a-digest",
        },
      }),
    TypeError,
  );
});

test("gate: no baseline blocks", () => {
  strictEqual(notQualifyingReason(gate({ baseline: null })), "no-baseline");
});

test("gate: baseline family mismatch blocks", () => {
  strictEqual(
    notQualifyingReason(gate({ baseline: baseline({ familyId: "other-family" }) })),
    "baseline-family-mismatch",
  );
});

test("gate: baseline without intervention count blocks", () => {
  const noCountBaseline = baselineMeasure({
    baselineId: "baseline-002",
    familyRef,
    scope: { scope: "task", taskId: "task-001" },
    interventionCount: null,
    monetaryCost: monetaryCost("USD", 500),
    duration: null,
    provenance,
  });
  strictEqual(
    notQualifyingReason(gate({ baseline: noCountBaseline })),
    "baseline-lacks-intervention-count",
  );
});

test("gate: not fewer interventions blocks", () => {
  strictEqual(notQualifyingReason(gate({ count: 3 })), "not-fewer-interventions");
});

test("gate: missing paired quality blocks as quality-unverified", () => {
  strictEqual(notQualifyingReason(gate({ quality: null })), "quality-unverified");
});

test("gate: paired quality for another task blocks as mismatch", () => {
  strictEqual(
    notQualifyingReason(gate({ quality: metric(0.9, "task-002") })),
    "paired-quality-mismatch",
  );
});

test("gate: verified quality below threshold blocks", () => {
  strictEqual(notQualifyingReason(gate({ quality: metric(0.5) })), "quality-below-threshold");
});

test("gate: hard-constraint safety regression blocks", () => {
  strictEqual(
    notQualifyingReason(gate({ regressions: [regression(null)] })),
    "safety-regression-present",
  );
});

test("gate: fewer interventions with acceptable verified quality qualifies", () => {
  const verdict = gate({});
  strictEqual(verdict.kind, "qualified-progress");
  if (verdict.kind === "qualified-progress") {
    strictEqual(verdict.baselineInterventionCount, 3);
    strictEqual(verdict.interventionCount, 1);
    strictEqual(verdict.pairedQualityScore, 0.9);
    strictEqual(verdict.safetyRegressionCount, 0);
  }
  const unrelatedRegression = gate({ regressions: [regression("task-999")] });
  strictEqual(unrelatedRegression.kind, "qualified-progress");
  ok(unrelatedRegression.kind === "qualified-progress");
});
