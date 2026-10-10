/**
 * W027 验收点 3：clash 检查报告相关系统、公差与覆盖；未检查的系统不被暗示已验证。
 *
 * 断言：
 * - clash profile 强制 system-geometry 的 coverageRequired=true（每条证据必须声明覆盖范围）。
 * - 未检查的系统由 outputBounds.explicitUnknowns 与 requiredAssumptionTags 表达
 *   （unchecked-systems / unchecked-systems-list）。
 * - 冲突系统几何直接 BLOCKED（blockOnConflict=true + blockOnMissingMandatory=true）。
 * - 缺失 coverage（系统几何存在但 coverage 字段缺失）→ 缺口记为质量不满足。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASH_PROFILE,
  assessSufficiency,
  resolveProfile,
  createProfileRegistry,
} from "../src/index.ts";
import type { ReconstructionIntent } from "../src/index.ts";

function buildClashIntent(evidence: ReconstructionIntent["evidence"]): ReconstructionIntent {
  return {
    taskId: "task-clash-001",
    projectId: "project-001",
    workType: "clash",
    targetScope: ["mep", "structure"],
    requestedFidelity: "coordination",
    decisions: ["clash-mep-vs-structure"],
    consequenceOfError: "medium",
    evidence,
  };
}

test("acceptance-3: clash profile requires coverage on system-geometry (unchecked systems are not implied validated)", () => {
  const sysReq = CLASH_PROFILE.requiredInputs.find((r) => r.kind === "system-geometry");
  assert.ok(sysReq);
  assert.equal(sysReq.coverageRequired, true, "clash system-geometry must require coverage");
  assert.equal(sysReq.blockOnConflict, true, "clash system-geometry must block on conflict");
});

test("acceptance-3: clash output bounds include unchecked-systems as explicit unknowns", () => {
  assert.ok(
    CLASH_PROFILE.outputBounds.explicitUnknowns.includes("unchecked-systems"),
    "clash must list unchecked-systems as an explicit unknown",
  );
  assert.ok(
    CLASH_PROFILE.outputBounds.requiredAssumptionTags.includes("unchecked-systems-list"),
    "clash must require an unchecked-systems-list assumption tag",
  );
  assert.ok(CLASH_PROFILE.outputBounds.requiredAssumptionTags.includes("coverage-statement"));
});

test("acceptance-3: clash with covered system geometry + tolerance + transforms is READY", () => {
  const registry = createProfileRegistry();
  registry.register(CLASH_PROFILE);
  const intent = buildClashIntent([
    {
      id: "sys-geom-1",
      kind: "system-geometry",
      provenance: {
        sourceKind: "drawing",
        sourceId: "mep-drawing-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "measured",
      coverage: "all MEP systems level 1-3",
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
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : CLASH_PROFILE,
  );
  assert.equal(assessment.state, "READY");
});

test("acceptance-3: clash with system geometry missing coverage is NOT READY (coverage is mandatory)", () => {
  const registry = createProfileRegistry();
  registry.register(CLASH_PROFILE);
  // system-geometry 存在但无 coverage 字段：coverageRequired 不满足。
  const intent = buildClashIntent([
    {
      id: "sys-geom-no-cov",
      kind: "system-geometry",
      provenance: {
        sourceKind: "drawing",
        sourceId: "mep-drawing-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "measured",
      // 故意缺失 coverage
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
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : CLASH_PROFILE,
  );
  assert.notEqual(assessment.state, "READY");
  // clash profile blockOnMissingMandatory=true → 强制门质量不满足（coverageOk=false）应阻塞。
  assert.equal(assessment.state, "BLOCKED");
  const sysGap = assessment.gaps.find((g) => g.kind === "system-geometry");
  assert.ok(sysGap, "must record gap for system-geometry missing coverage");
});

test("acceptance-3: clash with conflicting system geometry is BLOCKED (blockOnConflict)", () => {
  const registry = createProfileRegistry();
  registry.register(CLASH_PROFILE);
  const intent = buildClashIntent([
    {
      id: "sys-geom-conflict-a",
      kind: "system-geometry",
      provenance: {
        sourceKind: "drawing",
        sourceId: "mep-drawing-001",
        timestamp: "2024-07-01T10:00:00Z",
      },
      inferenceTag: "disputed",
      coverage: "all MEP level 1",
      conflictsWith: ["sys-geom-conflict-b"],
    },
    {
      id: "sys-geom-conflict-b",
      kind: "system-geometry",
      provenance: { sourceKind: "scan", sourceId: "scan-001", timestamp: "2024-07-02T10:00:00Z" },
      inferenceTag: "disputed",
      coverage: "all MEP level 1",
      conflictsWith: ["sys-geom-conflict-a"],
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
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : CLASH_PROFILE,
  );
  assert.equal(assessment.state, "BLOCKED");
  const sysGap = assessment.gaps.find((g) => g.kind === "system-geometry");
  assert.ok(sysGap);
  assert.equal(sysGap.inferenceTag, "disputed");
});
