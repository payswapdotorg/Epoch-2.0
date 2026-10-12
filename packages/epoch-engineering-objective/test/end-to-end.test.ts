import { test } from "node:test";
import { ok, strictEqual, throws } from "node:assert";
import {
  buildEndToEndCase,
  buildLimitationsReport,
  verifyEndToEndCase,
} from "../src/build/end-to-end.js";
import { sha256Hex, toSha256Digest } from "../src/canonical.js";
import type { EndToEndStageSpecInput } from "../src/build/end-to-end.js";

const familyRef = { familyId: "engineering-automation", version: "1.0.0" };
const ref = (name: string) => ({ namespace: "epoch-lifecycle:evidence", digest: sha256Hex(name) });
const evidence = (key: string) => ({
  lifecyclePhase: "verification",
  evidenceKey: key,
  digest: sha256Hex(key),
});

function stageSpec(stage: string, inputName: string): EndToEndStageSpecInput {
  return {
    stage,
    summary: `${stage} summary`,
    inputs: [ref(`${inputName}-in`)],
    outputs: [ref(`${inputName}-out`)],
    evidence: [evidence(`${inputName}-evidence`)],
  };
}

function buildCase() {
  return buildEndToEndCase({
    caseId: "case-001",
    familyRef,
    stages: [
      stageSpec("reconstruction", "reconstruction"),
      stageSpec("assessment", "assessment"),
      stageSpec("environment-mini-app", "environment"),
      stageSpec("verification", "verification"),
      stageSpec("gap-closure", "gap-closure"),
    ],
  });
}

test("buildEndToEndCase seals a five-stage digest chain", () => {
  const built = buildCase();
  strictEqual(built.stages.length, 5);
  strictEqual(built.stages[0]?.prevStageDigest, null);
  strictEqual(built.stages[1]?.prevStageDigest, built.stages[0]?.stageDigest);
  strictEqual(built.stages[4]?.prevStageDigest, built.stages[3]?.stageDigest);
  ok(/^[0-9a-f]{64}$/.test(built.caseDigest));
});

test("buildEndToEndCase rejects the wrong stage count", () => {
  throws(
    () =>
      buildEndToEndCase({
        caseId: "case-002",
        familyRef,
        stages: [
          stageSpec("reconstruction", "a"),
          stageSpec("assessment", "b"),
          stageSpec("environment-mini-app", "c"),
          stageSpec("verification", "d"),
        ],
      }),
    TypeError,
  );
});

test("buildEndToEndCase rejects the wrong stage order", () => {
  throws(
    () =>
      buildEndToEndCase({
        caseId: "case-003",
        familyRef,
        stages: [
          stageSpec("reconstruction", "a"),
          stageSpec("environment-mini-app", "b"),
          stageSpec("assessment", "c"),
          stageSpec("verification", "d"),
          stageSpec("gap-closure", "e"),
        ],
      }),
    TypeError,
  );
});

test("buildEndToEndCase requires evidence on every stage", () => {
  throws(
    () =>
      buildEndToEndCase({
        caseId: "case-004",
        familyRef,
        stages: [
          stageSpec("reconstruction", "a"),
          { ...stageSpec("assessment", "b"), evidence: [] },
          stageSpec("environment-mini-app", "c"),
          stageSpec("verification", "d"),
          stageSpec("gap-closure", "e"),
        ],
      }),
    TypeError,
  );
});

test("verifyEndToEndCase accepts a freshly built case", () => {
  const built = buildCase();
  const verification = verifyEndToEndCase(built);
  strictEqual(verification.ok, true);
  if (verification.ok) {
    strictEqual(verification.caseId, "case-001");
    strictEqual(verification.caseDigest, built.caseDigest);
    strictEqual(verification.stageCount, 5);
  }
});

test("a tampered stage summary breaks the chain at that stage", () => {
  const built = buildCase();
  const tampered = {
    ...built,
    stages: built.stages.map((stage, index) =>
      index === 2 ? { ...stage, summary: "tampered" } : stage,
    ),
  };
  const verification = verifyEndToEndCase(tampered);
  strictEqual(verification.ok, false);
  if (!verification.ok) {
    strictEqual(verification.stageIndex, 2);
    ok(verification.reason.includes("stage digest mismatch"));
  }
});

test("a broken chain link is reported with its stage index", () => {
  const built = buildCase();
  const firstDigest = built.stages[0]?.stageDigest ?? null;
  const broken = {
    ...built,
    stages: built.stages.map((stage, index) =>
      index === 3 ? { ...stage, prevStageDigest: firstDigest } : stage,
    ),
  };
  const verification = verifyEndToEndCase(broken);
  strictEqual(verification.ok, false);
  if (!verification.ok) {
    strictEqual(verification.stageIndex, 3);
    ok(verification.reason.includes("chain link broken"));
  }
});

test("a tampered case digest is detected", () => {
  const built = buildCase();
  const tampered = { ...built, caseDigest: toSha256Digest(sha256Hex("tampered")) };
  const verification = verifyEndToEndCase(tampered);
  strictEqual(verification.ok, false);
  if (!verification.ok) {
    strictEqual(verification.reason, "case digest mismatch");
    strictEqual(verification.stageIndex, null);
  }
});

test("buildLimitationsReport requires honest bottlenecks and canonical stages", () => {
  const built = buildCase();
  const report = buildLimitationsReport({
    reportId: "limitations-001",
    caseId: built.caseId,
    caseDigest: built.caseDigest,
    remainingBottlenecks: [
      {
        bottleneckId: "bottleneck-001",
        description: "spec ambiguity still escalates to a human reviewer",
        affectedStages: ["assessment"],
        evidence: [ref("bottleneck-001")],
      },
    ],
    nextConstraint: "hard constraint: no execution authority",
  });
  strictEqual(
    report.reportDigest,
    buildLimitationsReport({
      reportId: "limitations-001",
      caseId: built.caseId,
      caseDigest: built.caseDigest,
      remainingBottlenecks: [
        {
          bottleneckId: "bottleneck-001",
          description: "spec ambiguity still escalates to a human reviewer",
          affectedStages: ["assessment"],
          evidence: [ref("bottleneck-001")],
        },
      ],
      nextConstraint: "hard constraint: no execution authority",
    }).reportDigest,
  );
  throws(
    () =>
      buildLimitationsReport({
        reportId: "limitations-002",
        caseId: built.caseId,
        caseDigest: built.caseDigest,
        remainingBottlenecks: [],
        nextConstraint: "c",
      }),
    TypeError,
  );
  throws(
    () =>
      buildLimitationsReport({
        reportId: "limitations-003",
        caseId: built.caseId,
        caseDigest: built.caseDigest,
        remainingBottlenecks: [
          {
            bottleneckId: "b-1",
            description: "d",
            affectedStages: ["not-a-stage"],
            evidence: [ref("b")],
          },
        ],
        nextConstraint: "c",
      }),
    TypeError,
  );
});
