import { test } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";
import {
  completionRecord,
  effectiveQualityScore,
  isVerifiedQualityAcceptable,
  qualityMetric,
  verifiedQualityShare,
} from "../src/build/completion.js";
import { qualityAcceptanceThreshold } from "../src/types/core.js";
import { sha256Hex } from "../src/canonical.js";

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const evidence = [
  {
    lifecyclePhase: "verification",
    evidenceKey: "battery-run-1",
    digest: sha256Hex("battery-run-1"),
  },
];

function buildCompletion() {
  return completionRecord({
    recordId: "completion-001",
    familyRef,
    taskId: "task-001",
    taskClassId: "code-review",
    lifecyclePhase: "verification",
    evidenceRefs: evidence,
    outcome: "completed",
    completedAt: "2025-01-15T10:00:00Z",
  });
}

test("completionRecord builds a lifecycle-phase-keyed record with a stable digest", () => {
  const record = buildCompletion();
  strictEqual(record.lifecyclePhase, "verification");
  strictEqual(record.recordDigest, buildCompletion().recordDigest);
});

test("completionRecord requires at least one W022 evidence ref", () => {
  throws(
    () =>
      completionRecord({
        recordId: "c",
        familyRef,
        taskId: "task-001",
        taskClassId: "code-review",
        lifecyclePhase: "verification",
        evidenceRefs: [],
        outcome: "completed",
        completedAt: "2025-01-15T10:00:00Z",
      }),
    TypeError,
  );
});

test("completionRecord validates the lifecycle phase key", () => {
  throws(
    () =>
      completionRecord({
        recordId: "c",
        familyRef,
        taskId: "task-001",
        taskClassId: "code-review",
        lifecyclePhase: "Not A Phase",
        evidenceRefs: evidence,
        outcome: "completed",
        completedAt: "2025-01-15T10:00:00Z",
      }),
    TypeError,
  );
});

test("qualityMetric verified carries a score", () => {
  const metric = qualityMetric({
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
  strictEqual(metric.verification.status, "verified");
  strictEqual(metric.qualityScore, 0.9);
});

test("failed and unverified metrics are structurally scoreless", () => {
  const failed = qualityMetric({
    metricId: "quality-002",
    familyRef,
    taskId: "task-002",
    measuredAt: "2025-01-15T10:05:00Z",
    verification: {
      status: "failed",
      batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("battery-2") },
    },
  });
  const unverified = qualityMetric({
    metricId: "quality-003",
    familyRef,
    taskId: "task-003",
    measuredAt: "2025-01-15T10:05:00Z",
    verification: { status: "unverified" },
  });
  strictEqual(failed.qualityScore, null);
  strictEqual(unverified.qualityScore, null);
});

test("effectiveQualityScore returns null unless verified", () => {
  const unverified = qualityMetric({
    metricId: "quality-003",
    familyRef,
    taskId: "task-003",
    measuredAt: "2025-01-15T10:05:00Z",
    verification: { status: "unverified" },
  });
  strictEqual(effectiveQualityScore(unverified), null);
  const verified = qualityMetric({
    metricId: "quality-001",
    familyRef,
    taskId: "task-001",
    measuredAt: "2025-01-15T10:05:00Z",
    verification: {
      status: "verified",
      batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("battery-1") },
      qualityScore: 0.5,
    },
  });
  strictEqual(effectiveQualityScore(verified), 0.5);
});

test("isVerifiedQualityAcceptable enforces the threshold", () => {
  const acceptance = qualityAcceptanceThreshold(0.8);
  const low = qualityMetric({
    metricId: "q-low",
    familyRef,
    taskId: "task-001",
    measuredAt: "2025-01-15T10:05:00Z",
    verification: {
      status: "verified",
      batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("b") },
      qualityScore: 0.5,
    },
  });
  const high = qualityMetric({
    metricId: "q-high",
    familyRef,
    taskId: "task-002",
    measuredAt: "2025-01-15T10:05:00Z",
    verification: {
      status: "verified",
      batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("b") },
      qualityScore: 0.9,
    },
  });
  strictEqual(isVerifiedQualityAcceptable(low, acceptance), false);
  strictEqual(isVerifiedQualityAcceptable(high, acceptance), true);
});

test("verifiedQualityShare counts every verification status", () => {
  const acceptance = qualityAcceptanceThreshold(0.8);
  const metrics = [
    qualityMetric({
      metricId: "m1",
      familyRef,
      taskId: "task-001",
      measuredAt: "2025-01-15T10:05:00Z",
      verification: {
        status: "verified",
        batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("b") },
        qualityScore: 0.9,
      },
    }),
    qualityMetric({
      metricId: "m2",
      familyRef,
      taskId: "task-002",
      measuredAt: "2025-01-15T10:05:00Z",
      verification: {
        status: "verified",
        batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("b") },
        qualityScore: 0.5,
      },
    }),
    qualityMetric({
      metricId: "m3",
      familyRef,
      taskId: "task-003",
      measuredAt: "2025-01-15T10:05:00Z",
      verification: {
        status: "failed",
        batteryRecordRef: { namespace: "epoch-verification:battery", digest: sha256Hex("b") },
      },
    }),
    qualityMetric({
      metricId: "m4",
      familyRef,
      taskId: "task-004",
      measuredAt: "2025-01-15T10:05:00Z",
      verification: { status: "unverified" },
    }),
  ];
  deepStrictEqual(verifiedQualityShare(metrics, acceptance), {
    kind: "verified-quality-share",
    total: 4,
    verified: 2,
    acceptable: 1,
    failed: 1,
    unverified: 1,
  });
});
