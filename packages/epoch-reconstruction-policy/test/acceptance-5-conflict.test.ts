/**
 * W027 验收点 5：冲突的图纸/照片/现场证据保留来源与时间戳，触发调和或条件结果。
 *
 * 断言：
 * - EvidenceDescriptor.provenance 携带 sourceKind + sourceId + timestamp。
 * - EvidenceGap.lastObservedProvenance 在缺口中保留来源历史（即便现状为 unknown/disputed）。
 * - 冲突证据（inferenceTag=disputed 或 conflictsWith 非空）在 profile 要求调和时
 *   触发 INFORMATION_REQUESTED 或 BLOCKED（不会静默择一）。
 * - 评估结果（SufficiencyAssessment）的 satisfied 项保留原 inferenceTag（不静默提升）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASH_PROFILE,
  assessSufficiency,
  isSufficiencyAssessment,
  isEvidenceGap,
  isEvidenceProvenance,
} from "../src/index.ts";
import type { ReconstructionIntent } from "../src/index.ts";

function buildClashIntent(evidence: ReconstructionIntent["evidence"]): ReconstructionIntent {
  return {
    taskId: "task-clash-conflict-001",
    projectId: "project-001",
    workType: "clash",
    targetScope: ["mep", "structure"],
    requestedFidelity: "coordination",
    decisions: ["clash-mep-vs-structure"],
    consequenceOfError: "medium",
    evidence,
  };
}

test("acceptance-5: conflicting evidence retains source + timestamp in provenance", () => {
  const evidence: ReconstructionIntent["evidence"] = [
    {
      id: "sys-geom-drawing",
      kind: "system-geometry",
      provenance: {
        sourceKind: "drawing",
        sourceId: "mep-drawing-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "disputed",
      coverage: "all MEP level 1",
      conflictsWith: ["sys-geom-scan"],
    },
    {
      id: "sys-geom-scan",
      kind: "system-geometry",
      provenance: {
        sourceKind: "scan",
        sourceId: "scan-batch-2024-07",
        timestamp: "2024-07-05T14:00:00Z",
      },
      inferenceTag: "disputed",
      coverage: "all MEP level 1",
      conflictsWith: ["sys-geom-drawing"],
    },
    {
      id: "tol-1",
      kind: "tolerance",
      provenance: {
        sourceKind: "specification",
        sourceId: "spec-tolerance-001",
        timestamp: "2024-07-01T11:00:00Z",
      },
      inferenceTag: "defaulted",
    },
    {
      id: "transform-1",
      kind: "system-transform",
      provenance: {
        sourceKind: "drawing",
        sourceId: "grid-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "confirmed",
    },
  ];
  // 验证 provenance 守卫：每条证据的 provenance 都合法且带 source + timestamp。
  for (const e of evidence) {
    assert.equal(isEvidenceProvenance(e.provenance), true);
    assert.ok(e.provenance.timestamp, "conflict evidence must retain timestamp");
    assert.ok(e.provenance.sourceId, "conflict evidence must retain sourceId");
  }
  const assessment = assessSufficiency(buildClashIntent(evidence), CLASH_PROFILE);
  assert.equal(isSufficiencyAssessment(assessment), true);
  // 冲突证据在 clash profile 下必须 BLOCKED（blockOnConflict=true + blockOnMissingMandatory=true）。
  assert.equal(assessment.state, "BLOCKED");
  // 缺口保留 lastObservedProvenance（来源历史）。
  const sysGap = assessment.gaps.find((g) => g.kind === "system-geometry");
  assert.ok(sysGap);
  assert.equal(isEvidenceGap(sysGap), true);
  assert.equal(sysGap.inferenceTag, "disputed");
  assert.ok(
    sysGap.lastObservedProvenance !== undefined,
    "conflict gap must retain lastObservedProvenance (source history)",
  );
  assert.ok(sysGap.lastObservedProvenance?.timestamp !== undefined);
  assert.ok(sysGap.lastObservedProvenance?.sourceId !== undefined);
});

test("acceptance-5: missing evidence gap retains lastObservedProvenance when some evidence was seen", () => {
  // 一条 inferred 的 system-geometry（quality shortfall）+ 一条 measured 的（quality ok）
  // 但冲突字段让其 disputed → 缺口仍保留 lastObserved。
  const evidence: ReconstructionIntent["evidence"] = [
    {
      id: "sys-geom-inferred",
      kind: "system-geometry",
      provenance: {
        sourceKind: "photo",
        sourceId: "site-photo-001",
        timestamp: "2024-06-15T08:00:00Z",
      },
      inferenceTag: "inferred",
      coverage: "partial",
    },
    {
      id: "tol-1",
      kind: "tolerance",
      provenance: {
        sourceKind: "specification",
        sourceId: "spec-tolerance-001",
        timestamp: "2024-07-01T11:00:00Z",
      },
      inferenceTag: "defaulted",
    },
    {
      id: "transform-1",
      kind: "system-transform",
      provenance: {
        sourceKind: "drawing",
        sourceId: "grid-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "confirmed",
    },
  ];
  const assessment = assessSufficiency(buildClashIntent(evidence), CLASH_PROFILE);
  // system-geometry 用 inferred 标签：acceptTags 排除 inferred → 质量不满足 → BLOCKED。
  assert.equal(assessment.state, "BLOCKED");
  const sysGap = assessment.gaps.find((g) => g.kind === "system-geometry");
  assert.ok(sysGap);
  assert.equal(sysGap.inferenceTag, "inferred");
  assert.ok(
    sysGap.lastObservedProvenance !== undefined,
    "quality-shortfall gap must retain lastObservedProvenance",
  );
  assert.equal(sysGap.lastObservedProvenance?.sourceId, "site-photo-001");
  assert.equal(sysGap.lastObservedProvenance?.timestamp, "2024-06-15T08:00:00Z");
});

test("acceptance-5: satisfied inputs preserve original inferenceTag (no silent promotion)", () => {
  // measured 证据被接受后，satisfied 项的 inferenceTag 必须仍是 measured，
  // 不得静默改写为 confirmed。
  const evidence: ReconstructionIntent["evidence"] = [
    {
      id: "sys-geom-1",
      kind: "system-geometry",
      provenance: {
        sourceKind: "drawing",
        sourceId: "mep-drawing-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "measured",
      coverage: "all MEP level 1-3",
    },
    {
      id: "tol-1",
      kind: "tolerance",
      provenance: {
        sourceKind: "specification",
        sourceId: "spec-tolerance-001",
        timestamp: "2024-07-01T11:00:00Z",
      },
      inferenceTag: "defaulted",
    },
    {
      id: "transform-1",
      kind: "system-transform",
      provenance: {
        sourceKind: "drawing",
        sourceId: "grid-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "confirmed",
    },
  ];
  const assessment = assessSufficiency(buildClashIntent(evidence), CLASH_PROFILE);
  assert.equal(assessment.state, "READY");
  const sysSatisfied = assessment.satisfied.find((s) => s.kind === "system-geometry");
  assert.ok(sysSatisfied);
  assert.equal(
    sysSatisfied.inferenceTag,
    "measured",
    "satisfied inferenceTag must be preserved as measured (not promoted to confirmed)",
  );
  const tolSatisfied = assessment.satisfied.find((s) => s.kind === "tolerance");
  assert.ok(tolSatisfied);
  assert.equal(
    tolSatisfied.inferenceTag,
    "defaulted",
    "defaulted tolerance must stay defaulted in satisfied record",
  );
});
