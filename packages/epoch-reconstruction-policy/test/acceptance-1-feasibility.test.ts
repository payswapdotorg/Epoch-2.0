/**
 * W027 验收点 1：早期 feasibility 不被强迫通过结构级模型。
 *
 * 断言：feasibility profile 在仅有照片/近似尺寸时返回 READY 或
 * CONDITIONALLY_READY（带显式未知与广域假设），绝不返回 BLOCKED；
 * 且 outputBounds.forbidOutputKinds 包含 structural-member-force 等
 * 结构级输出类别——feasibility 结果不得越权产出结构级结论。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEASIBILITY_PROFILE,
  assessSufficiency,
  resolveProfile,
  createProfileRegistry,
} from "../src/index.ts";
import type { ReconstructionIntent } from "../src/index.ts";

function buildFeasibilityIntent(
  evidence: ReconstructionIntent["evidence"],
  overrides: Partial<ReconstructionIntent> = {},
): ReconstructionIntent {
  return {
    taskId: "task-feasibility-001",
    projectId: "project-001",
    workType: "feasibility",
    targetScope: ["site-A"],
    requestedFidelity: "conceptual",
    decisions: ["concept-selection"],
    consequenceOfError: "low",
    evidence,
    ...overrides,
  };
}

test("acceptance-1: feasibility with photos + approximate dimensions is READY or CONDITIONALLY_READY, never BLOCKED", () => {
  const registry = createProfileRegistry();
  registry.register(FEASIBILITY_PROFILE);
  const intent = buildFeasibilityIntent([
    {
      id: "photo-1",
      kind: "photo",
      provenance: {
        sourceKind: "photo",
        sourceId: "site-photo-001",
        timestamp: "2024-05-01T08:00:00Z",
      },
      inferenceTag: "confirmed",
    },
    {
      id: "approx-dim-1",
      kind: "approximate-dimension",
      provenance: {
        sourceKind: "measurement",
        sourceId: "tape-001",
        timestamp: "2024-05-01T09:00:00Z",
      },
      inferenceTag: "measured",
      uncertainty: { value: 0.3, unit: "m" },
    },
    {
      id: "site-ctx-1",
      kind: "site-context",
      provenance: {
        sourceKind: "site-observation",
        sourceId: "visit-001",
        timestamp: "2024-05-01T08:00:00Z",
      },
      inferenceTag: "confirmed",
    },
    {
      id: "scope-1",
      kind: "concept-scope",
      provenance: {
        sourceKind: "author",
        sourceId: "planner-001",
        timestamp: "2024-05-02T10:00:00Z",
      },
      inferenceTag: "confirmed",
    },
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : FEASIBILITY_PROFILE,
  );
  assert.ok(
    assessment.state === "READY" || assessment.state === "CONDITIONALLY_READY",
    `feasibility must not be BLOCKED; got ${assessment.state}`,
  );
  assert.notEqual(assessment.state, "BLOCKED");
});

test("acceptance-1: feasibility output bounds forbid structural-grade detail (never forced through structural-grade model)", () => {
  // 验收点 1 的核心：feasibility profile 的 outputBounds 显式禁止结构级输出。
  assert.ok(
    FEASIBILITY_PROFILE.outputBounds.forbidOutputKinds.includes("structural-member-force"),
    "feasibility must forbid structural-member-force output",
  );
  assert.ok(
    FEASIBILITY_PROFILE.outputBounds.forbidOutputKinds.includes("structural-connection-capacity"),
  );
  assert.ok(FEASIBILITY_PROFILE.outputBounds.forbidOutputKinds.includes("detailed-boq-line-item"));
  assert.ok(
    FEASIBILITY_PROFILE.outputBounds.explicitUnknowns.includes("structural-capacity"),
    "feasibility must keep structural-capacity as an explicit unknown",
  );
  assert.ok(FEASIBILITY_PROFILE.outputBounds.explicitUnknowns.includes("precise-quantity"));
});

test("acceptance-1: feasibility tolerates inferred/defaulted site-context (early-stage broad ranges)", () => {
  const registry = createProfileRegistry();
  registry.register(FEASIBILITY_PROFILE);
  // 推断的 site-context 与默认的 concept-scope：feasibility 接受（acceptTags 含 inferred/defaulted）。
  const intent = buildFeasibilityIntent([
    {
      id: "site-ctx-inferred",
      kind: "site-context",
      provenance: {
        sourceKind: "site-observation",
        sourceId: "visit-001",
        timestamp: "2024-05-01T08:00:00Z",
      },
      inferenceTag: "inferred",
    },
    {
      id: "scope-defaulted",
      kind: "concept-scope",
      provenance: {
        sourceKind: "author",
        sourceId: "planner-001",
        timestamp: "2024-05-02T10:00:00Z",
      },
      inferenceTag: "defaulted",
    },
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const profile = resolution.status === "matched" ? resolution.profile : FEASIBILITY_PROFILE;
  const assessment = assessSufficiency(intent, profile);
  // 推断/默认的强制门满足（acceptTags 含 inferred/defaulted），但状态为 CONDITIONALLY_READY
  //（因为 satisfied 全是 inferred/defaulted——allSatisfiedInferredOrDefaulted 触发条件结果）。
  assert.ok(
    assessment.state === "READY" || assessment.state === "CONDITIONALLY_READY",
    `feasibility with inferred/defaulted mandatory must remain READY or CONDITIONALLY_READY; got ${assessment.state}`,
  );
  assert.notEqual(assessment.state, "BLOCKED");
  // 推断/默认证据在 satisfied 列表中保留其原标签（验收点 8 在此也体现）。
  for (const s of assessment.satisfied) {
    assert.ok(
      s.inferenceTag === "inferred" || s.inferenceTag === "defaulted",
      "feasibility satisfied inferenceTag must reflect the original evidence tag (not silently promoted)",
    );
  }
});

test("acceptance-1: feasibility with missing mandatory site-context triggers INFORMATION_REQUESTED, not BLOCKED", () => {
  const registry = createProfileRegistry();
  registry.register(FEASIBILITY_PROFILE);
  // 完全缺失 site-context 与 concept-scope：feasibility 不阻塞，仅请求信息。
  const intent = buildFeasibilityIntent([]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : FEASIBILITY_PROFILE,
  );
  assert.equal(assessment.state, "INFORMATION_REQUESTED");
  assert.notEqual(assessment.state, "BLOCKED");
  assert.ok(
    assessment.requests.length > 0,
    "feasibility must produce at least one information request when mandatory is missing",
  );
});
