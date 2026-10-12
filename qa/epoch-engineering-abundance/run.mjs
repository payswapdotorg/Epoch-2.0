#!/usr/bin/env node
// W035 QA harness — engineering automation and abundance evaluation.
// Read-only measurement over fixture lifecycle/evidence records.
// Prerequisite: pnpm --filter @zcode/epoch-engineering-objective build
// Exits non-zero on any assertion failure.

import { deepStrictEqual, ok, strictEqual } from "node:assert";
import * as engine from "../../packages/epoch-engineering-objective/dist/src/index.js";

const {
  assertPublicContract,
  automationDenominator,
  baselineMeasure,
  buildEndToEndCase,
  buildLimitationsReport,
  capabilityReuseObservation,
  completionRecord,
  evaluateAbundance,
  interventionMeasure,
  monetaryCost,
  predictionVarianceRecord,
  qualityAcceptanceThreshold,
  qualityMetric,
  safetyRegressionMeasure,
  sha256Hex,
  taskClassRule,
  taskExecutionRecord,
  taskFamilyRef,
} = engine;

const contractAssertion = assertPublicContract(engine);
ok(contractAssertion.ok, "public contract assertion failed");

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const family = taskFamilyRef(familyRef.familyId, familyRef.version);
const ref = (name) => ({ namespace: "epoch-lifecycle:evidence", digest: sha256Hex(name) });
const evidence = (phase, key) => ({ lifecyclePhase: phase, evidenceKey: key, digest: sha256Hex(key) });

function buildInputs() {
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
    completionRecord({ recordId: "completion-001", familyRef, taskId: "task-001", taskClassId: "code-review", lifecyclePhase: "verification", evidenceRefs: [evidence("verification", "task-001-battery")], outcome: "completed", completedAt: "2025-01-15T10:00:00Z" }),
    completionRecord({ recordId: "completion-002", familyRef, taskId: "task-002", taskClassId: "manual-ops", lifecyclePhase: "verification", evidenceRefs: [evidence("verification", "task-002-battery")], outcome: "completed", completedAt: "2025-01-15T10:00:00Z" }),
  ];
  const qualityMetrics = [
    qualityMetric({ metricId: "quality-001", familyRef, taskId: "task-001", measuredAt: "2025-01-15T10:05:00Z", verification: { status: "verified", batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("battery-001") }, qualityScore: 0.92 } }),
  ];
  const baselines = [
    baselineMeasure({ baselineId: "baseline-001", familyRef, scope: { scope: "task", taskId: "task-001" }, interventionCount: 3, monetaryCost: null, duration: null, provenance: [ref("baseline-provenance")] }),
  ];
  const interventions = [
    interventionMeasure({ interventionId: "intervention-001", familyRef, taskId: "task-001", interventionCount: 1, monetaryCost: null, duration: null, learningRef: { namespace: "epoch-capability-learning:intervention", digest: sha256Hex("learning-001") } }),
  ];
  const executions = [
    taskExecutionRecord({ taskId: "task-001", familyRef, taskClassId: "code-review", mode: { mode: "automated", executedBy: "epoch-agent", evidence: { namespace: "epoch-agent-tools:command", digest: sha256Hex("command-001") } }, outcome: "succeeded" }),
    taskExecutionRecord({ taskId: "task-002", familyRef, taskClassId: "manual-ops", mode: { mode: "human", reason: "physical presence required" }, outcome: "succeeded" }),
  ];
  const reuseObservations = [
    capabilityReuseObservation({ taskId: "task-001", familyRef, capabilityKey: "review-heuristics", reused: true, reproductionRef: { namespace: "epoch-capability-reproduction:record", digest: sha256Hex("reproduction-001") }, learningRef: { namespace: "epoch-capability-learning:intervention", digest: sha256Hex("learning-001") } }),
  ];
  const safetyMeasures = [
    safetyRegressionMeasure({ measureId: "safety-001", familyRef, taskId: "task-001", hardConstraintId: "no-execution-authority", status: "no-regression", frontierRef: { namespace: "epoch-cost-quality-search:outcome", digest: sha256Hex("frontier-001") }, evidenceRefs: [ref("safety-evidence-001")] }),
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
  ];
  const endToEndCase = buildEndToEndCase({
    caseId: "case-001",
    familyRef,
    stages: [
      { stage: "reconstruction", summary: "objective reconstructed from W031 reproduction records", inputs: [ref("reconstruction-in")], outputs: [ref("reconstruction-out")], evidence: [evidence("reconstruction", "case-001-reconstruction")] },
      { stage: "assessment", summary: "capability coverage assessed", inputs: [ref("assessment-in")], outputs: [ref("assessment-out")], evidence: [evidence("assessment", "case-001-assessment")] },
      { stage: "environment-mini-app", summary: "environment and mini-app prepared", inputs: [ref("env-in")], outputs: [ref("env-out")], evidence: [evidence("environment-mini-app", "case-001-environment")] },
      { stage: "verification", summary: "W020 battery executed over the outputs", inputs: [ref("verification-in")], outputs: [ref("verification-out")], evidence: [evidence("verification", "case-001-verification")] },
      { stage: "gap-closure", summary: "remaining capability gaps closed or recorded", inputs: [ref("gap-in")], outputs: [ref("gap-out")], evidence: [evidence("gap-closure", "case-001-gap-closure")] },
    ],
  });
  const limitations = buildLimitationsReport({
    reportId: "limitations-001",
    caseId: endToEndCase.caseId,
    caseDigest: endToEndCase.caseDigest,
    remainingBottlenecks: [
      { bottleneckId: "bottleneck-001", description: "spec ambiguity still escalates to a human reviewer", affectedStages: ["assessment"], evidence: [ref("bottleneck-001")] },
    ],
    nextConstraint: "hard constraint: this package holds no execution authority — measurement stays read-only",
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

const first = evaluateAbundance(buildInputs());
const second = evaluateAbundance(buildInputs());

strictEqual(first.evaluationDigest, second.evaluationDigest, "evaluation digest must be deterministic");
strictEqual(first.inputDigest, second.inputDigest, "input digest must be deterministic");
ok(first.endToEndProvenance.ok === true, "end-to-end provenance must verify");
strictEqual(first.familyRef.familyId, family.familyId);

// The typed laws, checked on the fixture.
strictEqual(first.completion.inDenominator, 1);
deepStrictEqual(first.visibleNonAutomatedTaskIds, ["task-002"]);
ok(!first.escalationRate.automatedSuccessTaskIds.includes("task-002"), "human tasks are never automated successes");
strictEqual(first.interventionProgress[0]?.progress.kind, "qualified-progress");
strictEqual(first.abundanceClaims[0]?.kind, "lower-cost-claim");
strictEqual(first.claimableCostDeltas[0]?.currencyCode, "USD");
strictEqual(first.claimableCostDeltas[0]?.claimedReductionMinorUnits, 300);

console.log(
  [
    "W035 QA — engineering automation and abundance evaluation",
    `  family: ${first.familyRef.familyId}@${first.familyRef.version}`,
    `  denominator: ${first.denominator.includedTaskClasses.map((c) => c.classId).join(", ")} (policy: ${first.denominator.defaultPolicy})`,
    `  completion: ${first.completion.completed}/${first.completion.inDenominator} completed in denominator (excluded: ${first.completion.excludedTaskIds.join(", ") || "none"})`,
    `  verified quality: ${first.verifiedQuality.verified} verified, ${first.verifiedQuality.acceptable} acceptable of ${first.verifiedQuality.total}`,
    `  escalation rate: ${first.escalationRate.rate} (${first.escalationRate.escalatedHumanTasks} human, ${first.escalationRate.escalatedArenaTasks} arena)`,
    `  capability reuse rate: ${first.capabilityReuseRate.rate} (${first.capabilityReuseRate.reuseEvents}/${first.capabilityReuseRate.reuseOpportunities})`,
    `  intervention progress: ${first.interventionProgress.filter((e) => e.progress.kind === "qualified-progress").length} qualified`,
    `  abundance claims: ${first.abundanceClaims.filter((c) => c.kind === "lower-cost-claim").length} lower-cost claim(s)`,
    `  visible non-automated tasks: ${first.visibleNonAutomatedTaskIds.join(", ") || "none"}`,
    `  provenance: ${first.endToEndProvenance.ok ? `verified (${first.endToEndProvenance.stageCount} stages)` : "FAILED"}`,
    `  next constraint: ${first.limitations.nextConstraint}`,
    `  evaluation digest: ${first.evaluationDigest}`,
    "QA OK",
  ].join("\n")
);
