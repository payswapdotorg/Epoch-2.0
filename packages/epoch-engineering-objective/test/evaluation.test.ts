import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";
import {
  automationDenominator,
  taskClassRule,
} from "../src/build/denominators.js";
import { completionRecord, qualityMetric } from "../src/build/completion.js";
import { baselineMeasure, interventionMeasure } from "../src/build/measures.js";
import { safetyRegressionMeasure } from "../src/build/safety.js";
import {
  capabilityReuseObservation,
  taskExecutionRecord,
} from "../src/build/rates.js";
import { predictionVarianceRecord } from "../src/build/variance.js";
import {
  buildEndToEndCase,
  buildLimitationsReport,
} from "../src/build/end-to-end.js";
import { evaluateAbundance } from "../src/build/evaluation.js";
import { monetaryCost, qualityAcceptanceThreshold } from "../src/types/core.js";
import { sha256Hex } from "../src/canonical.js";
import type { AbundanceEvaluationInput } from "../src/types/evaluation.js";

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const ref = (name: string) => ({ namespace: "epoch-lifecycle:evidence", digest: sha256Hex(name) });
const evidence = (key: string) => ({
  lifecyclePhase: "verification",
  evidenceKey: key,
  digest: sha256Hex(key),
});

function buildInputs(): AbundanceEvaluationInput {
  const denominator = automationDenominator({
    denominatorId: "engineering-automation-denominator",
    familyRef,
    includedTaskClasses: [
      taskClassRule("code-review", "automated code review", "counts: W020-verifiable output"),
      taskClassRule("test-authoring", "automated test authoring", "counts: W020-verifiable output"),
    ],
    excludedTaskClasses: [
      taskClassRule("manual-ops", "manual operations", "excluded: physical presence required"),
    ],
  });
  const completions = [
    completionRecord({ recordId: "completion-001", familyRef, taskId: "task-001", taskClassId: "code-review", lifecyclePhase: "verification", evidenceRefs: [evidence("task-001-evidence")], outcome: "completed", completedAt: "2025-01-15T10:00:00Z" }),
    completionRecord({ recordId: "completion-002", familyRef, taskId: "task-002", taskClassId: "test-authoring", lifecyclePhase: "verification", evidenceRefs: [evidence("task-002-evidence")], outcome: "completed", completedAt: "2025-01-15T10:00:00Z" }),
    completionRecord({ recordId: "completion-003", familyRef, taskId: "task-003", taskClassId: "manual-ops", lifecyclePhase: "verification", evidenceRefs: [evidence("task-003-evidence")], outcome: "completed", completedAt: "2025-01-15T10:00:00Z" }),
    completionRecord({ recordId: "completion-004", familyRef, taskId: "task-004", taskClassId: "code-review", lifecyclePhase: "verification", evidenceRefs: [evidence("task-004-evidence")], outcome: "incomplete", completedAt: "2025-01-15T10:00:00Z" }),
  ];
  const qualityMetrics = [
    qualityMetric({ metricId: "quality-001", familyRef, taskId: "task-001", measuredAt: "2025-01-15T10:05:00Z", verification: { status: "verified", batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("battery-001") }, qualityScore: 0.9 } }),
    qualityMetric({ metricId: "quality-002", familyRef, taskId: "task-002", measuredAt: "2025-01-15T10:05:00Z", verification: { status: "unverified" } }),
    qualityMetric({ metricId: "quality-003", familyRef, taskId: "task-004", measuredAt: "2025-01-15T10:05:00Z", verification: { status: "verified", batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("battery-003") }, qualityScore: 0.5 } }),
  ];
  const baselines = [
    baselineMeasure({ baselineId: "baseline-001", familyRef, scope: { scope: "task", taskId: "task-001" }, interventionCount: 3, monetaryCost: null, duration: null, provenance: [ref("baseline-001-provenance")] }),
    baselineMeasure({ baselineId: "baseline-002", familyRef, scope: { scope: "task", taskId: "task-002" }, interventionCount: 5, monetaryCost: null, duration: null, provenance: [ref("baseline-002-provenance")] }),
  ];
  const interventions = [
    interventionMeasure({ interventionId: "intervention-001", familyRef, taskId: "task-001", interventionCount: 1, monetaryCost: null, duration: null, learningRef: { namespace: "epoch-capability-learning:intervention", digest: sha256Hex("learning-001") } }),
    interventionMeasure({ interventionId: "intervention-002", familyRef, taskId: "task-002", interventionCount: 2, monetaryCost: null, duration: null, learningRef: { namespace: "epoch-capability-learning:intervention", digest: sha256Hex("learning-002") } }),
  ];
  const executions = [
    taskExecutionRecord({ taskId: "task-001", familyRef, taskClassId: "code-review", mode: { mode: "automated", executedBy: "epoch-agent", evidence: { namespace: "epoch-agent-tools:command", digest: sha256Hex("command-001") } }, outcome: "succeeded" }),
    taskExecutionRecord({ taskId: "task-002", familyRef, taskClassId: "test-authoring", mode: { mode: "automated", executedBy: "epoch-agent", evidence: { namespace: "epoch-agent-tools:command", digest: sha256Hex("command-002") } }, outcome: "succeeded" }),
    taskExecutionRecord({ taskId: "task-003", familyRef, taskClassId: "manual-ops", mode: { mode: "human", reason: "physical presence required" }, outcome: "succeeded" }),
    taskExecutionRecord({ taskId: "task-005", familyRef, taskClassId: "code-review", mode: { mode: "arena", ref: { namespace: "epoch-agent-tools:audit", digest: sha256Hex("arena-005") }, reason: "requires arena evaluation" }, outcome: "abandoned" }),
  ];
  const reuseObservations = [
    capabilityReuseObservation({ taskId: "task-001", familyRef, capabilityKey: "review-heuristics", reused: true, reproductionRef: { namespace: "epoch-capability-reproduction:record", digest: sha256Hex("reproduction-001") }, learningRef: { namespace: "epoch-capability-learning:intervention", digest: sha256Hex("learning-001") } }),
    capabilityReuseObservation({ taskId: "task-002", familyRef, capabilityKey: "review-heuristics", reused: true, reproductionRef: { namespace: "epoch-capability-reproduction:record", digest: sha256Hex("reproduction-001") }, learningRef: { namespace: "epoch-capability-learning:intervention", digest: sha256Hex("learning-001") } }),
    capabilityReuseObservation({ taskId: "task-004", familyRef, capabilityKey: "review-heuristics", reused: false, reproductionRef: { namespace: "epoch-capability-reproduction:record", digest: sha256Hex("reproduction-001") }, learningRef: { namespace: "epoch-capability-learning:intervention", digest: sha256Hex("learning-001") } }),
  ];
  const safetyMeasures = [
    safetyRegressionMeasure({ measureId: "safety-001", familyRef, taskId: "task-001", hardConstraintId: "no-execution-authority", status: "no-regression", frontierRef: { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("frontier-001") }, evidenceRefs: [ref("safety-001-evidence")] }),
    safetyRegressionMeasure({ measureId: "safety-002", familyRef, taskId: null, hardConstraintId: "read-only-measurement", status: "unknown", frontierRef: { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("frontier-002") }, evidenceRefs: [ref("safety-002-evidence")] }),
  ];
  const variances = [
    predictionVarianceRecord({
      varianceId: "variance-001",
      familyRef,
      taskId: "task-001",
      predicted: { monetaryCost: monetaryCost("USD", 1000), duration: null, predictedQualityScore: 0.9, frontierRef: { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("frontier-001") } },
      actual: { monetaryCost: monetaryCost("USD", 700), duration: null, verifiedQuality: qualityMetrics[0] ?? null },
      feasibility: { feasible: true, solutionRef: { namespace: "epoch-capability-reproduction:record", digest: sha256Hex("solution-001") }, note: "solution reproduced and verified" },
    }),
    predictionVarianceRecord({
      varianceId: "variance-002",
      familyRef,
      taskId: "task-004",
      predicted: { monetaryCost: monetaryCost("USD", 500), duration: null, predictedQualityScore: 0.7, frontierRef: { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("frontier-002") } },
      actual: { monetaryCost: monetaryCost("USD", 400), duration: null, verifiedQuality: qualityMetrics[2] ?? null },
      feasibility: { feasible: false, reason: "no feasible solution within the hard constraints" },
    }),
  ];
  const endToEndCase = buildEndToEndCase({
    caseId: "case-001",
    familyRef,
    stages: [
      { stage: "reconstruction", summary: "objective reconstructed from W031 records", inputs: [ref("reconstruction-in")], outputs: [ref("reconstruction-out")], evidence: [evidence("case-reconstruction")] },
      { stage: "assessment", summary: "capability coverage assessed", inputs: [ref("assessment-in")], outputs: [ref("assessment-out")], evidence: [evidence("case-assessment")] },
      { stage: "environment-mini-app", summary: "environment and mini-app prepared", inputs: [ref("environment-in")], outputs: [ref("environment-out")], evidence: [evidence("case-environment")] },
      { stage: "verification", summary: "W020 battery executed", inputs: [ref("verification-in")], outputs: [ref("verification-out")], evidence: [evidence("case-verification")] },
      { stage: "gap-closure", summary: "remaining gaps closed or recorded", inputs: [ref("gap-in")], outputs: [ref("gap-out")], evidence: [evidence("case-gap-closure")] },
    ],
  });
  const limitations = buildLimitationsReport({
    reportId: "limitations-001",
    caseId: endToEndCase.caseId,
    caseDigest: endToEndCase.caseDigest,
    remainingBottlenecks: [
      {
        bottleneckId: "bottleneck-001",
        description: "spec ambiguity still escalates to a human reviewer",
        affectedStages: ["assessment"],
        evidence: [ref("bottleneck-001")],
      },
    ],
    nextConstraint: "hard constraint: no execution authority — measurement stays read-only",
  });
  return {
    evaluationId: "engineering-automation-evaluation",
    denominator,
    completions,
    qualityMetrics,
    baselines,
    interventions,
    executions,
    reuseObservations,
    safetyMeasures,
    variances,
    qualityAcceptance: qualityAcceptanceThreshold(0.8),
    endToEndCase,
    limitations,
  };
}

test("completion share respects the explicit denominator", () => {
  const evaluation = evaluateAbundance(buildInputs());
  deepStrictEqual(evaluation.completion, {
    kind: "completion-share",
    total: 4,
    completed: 2,
    inDenominator: 3,
    excludedTaskIds: ["task-003"],
  });
});

test("human and arena tasks stay visible and never count as automated successes", () => {
  const evaluation = evaluateAbundance(buildInputs());
  deepStrictEqual(evaluation.visibleNonAutomatedTaskIds, ["task-003", "task-005"]);
  deepStrictEqual(evaluation.escalationRate.automatedSuccessTaskIds, ["task-001", "task-002"]);
  strictEqual(evaluation.escalationRate.rate, 0.5);
  strictEqual(evaluation.capabilityReuseRate.rate, 2 / 3);
});

test("intervention progress applies the quality gate per task", () => {
  const evaluation = evaluateAbundance(buildInputs());
  strictEqual(evaluation.interventionProgress.length, 2);
  const qualified = evaluation.interventionProgress.find((e) => e.taskId === "task-001");
  ok(qualified !== undefined);
  strictEqual(qualified.progress.kind, "qualified-progress");
  const blocked = evaluation.interventionProgress.find((e) => e.taskId === "task-002");
  ok(blocked !== undefined);
  strictEqual(blocked.progress.kind, "not-qualifying");
  if (blocked.progress.kind === "not-qualifying") {
    strictEqual(blocked.progress.reason, "quality-unverified");
  }
});

test("abundance claims pass the feasibility gate and aggregate per currency", () => {
  const evaluation = evaluateAbundance(buildInputs());
  strictEqual(evaluation.abundanceClaims.length, 2);
  const claim = evaluation.abundanceClaims.find((c) => c.kind === "lower-cost-claim");
  ok(claim !== undefined);
  if (claim?.kind === "lower-cost-claim") {
    strictEqual(claim.claimedReductionMinorUnits, 300);
    strictEqual(claim.currencyCode, "USD");
  }
  deepStrictEqual(evaluation.claimableCostDeltas, [
    { kind: "claimable-cost-delta", currencyCode: "USD", claimedReductionMinorUnits: 300, claimCount: 1 },
  ]);
});

test("end-to-end provenance verifies and limitations attach", () => {
  const evaluation = evaluateAbundance(buildInputs());
  strictEqual(evaluation.endToEndProvenance.ok, true);
  if (evaluation.endToEndProvenance.ok) {
    strictEqual(evaluation.endToEndProvenance.stageCount, 5);
  }
  strictEqual(evaluation.limitations?.remainingBottlenecks.length, 1);
});

test("a limitations report without its end-to-end case is rejected", () => {
  const inputs = { ...buildInputs(), endToEndCase: null };
  throws(() => evaluateAbundance(inputs), TypeError);
});

test("a limitations report referencing a different case is rejected", () => {
  const base = buildInputs();
  const mismatched = buildLimitationsReport({
    reportId: "limitations-002",
    caseId: "case-001",
    caseDigest: sha256Hex("wrong-case"),
    remainingBottlenecks: [
      { bottleneckId: "bottleneck-002", description: "d", affectedStages: ["verification"], evidence: [ref("b")] },
    ],
    nextConstraint: "c",
  });
  throws(() => evaluateAbundance({ ...base, limitations: mismatched }), TypeError);
});

test("the composed evaluation is deterministic", () => {
  const first = evaluateAbundance(buildInputs());
  const second = evaluateAbundance(buildInputs());
  strictEqual(first.evaluationDigest, second.evaluationDigest);
  strictEqual(first.inputDigest, second.inputDigest);
  ok(/^[0-9a-f]{64}$/.test(first.evaluationDigest));
});

test("without a case the provenance verdict is a typed failure; quality and safety summaries are present", () => {
  const base = buildInputs();
  const evaluation = evaluateAbundance({ ...base, endToEndCase: null, limitations: null });
  strictEqual(evaluation.endToEndProvenance.ok, false);
  if (!evaluation.endToEndProvenance.ok) {
    strictEqual(evaluation.endToEndProvenance.reason, "no end-to-end case was supplied");
  }
  deepStrictEqual(evaluation.verifiedQuality, {
    kind: "verified-quality-share",
    total: 3,
    verified: 2,
    acceptable: 1,
    failed: 0,
    unverified: 1,
  });
  strictEqual(evaluation.safety.hasRegressions, false);
});
