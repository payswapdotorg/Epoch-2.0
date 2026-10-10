/**
 * W027 验收点 7：任务变化时 Epoch 重算充分性，只请求「可能改变决策」的证据。
 *
 * 断言：
 * - 同一项目不同任务（feasibility vs structural）对同一证据集给出不同 fitness：
 *   feasibility 接受推断/默认（READY/CONDITIONALLY_READY），structural 阻塞（BLOCKED）。
 * - assessSufficiency 是纯函数：相同 intent+profile 输入恒产生相同输出。
 * - 信息请求按 netVoI 排序（rankInformationRequests）。
 * - filterDecisionChanging 过滤掉低决策影响请求（decisionImpactScore <= 阈值）。
 * - 只请求「可能改变决策」的证据：低 impact 的请求被过滤掉。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEASIBILITY_PROFILE,
  STRUCTURAL_PROFILE,
  assessSufficiency,
  resolveProfile,
  createProfileRegistry,
  rankInformationRequests,
  filterDecisionChanging,
  netVoI,
} from "../src/index.ts";
import type { InformationRequest, ReconstructionIntent } from "../src/index.ts";

const sharedEvidence: ReconstructionIntent["evidence"] = [
  {
    id: "site-ctx-1",
    kind: "site-context",
    provenance: {
      sourceKind: "site-observation",
      sourceId: "visit-001",
      timestamp: "2024-05-01T08:00:00Z",
    },
    inferenceTag: "inferred",
  },
  {
    id: "scope-1",
    kind: "concept-scope",
    provenance: {
      sourceKind: "author",
      sourceId: "planner-001",
      timestamp: "2024-05-02T10:00:00Z",
    },
    inferenceTag: "defaulted",
  },
  // 故意不提供结构荷载/支座/材料/代码——structural 任务应因此 BLOCKED。
];

function buildIntent(
  workType: string,
  fidelity: ReconstructionIntent["requestedFidelity"],
  consequenceOfError: ReconstructionIntent["consequenceOfError"],
): ReconstructionIntent {
  return {
    taskId: `task-${workType}-${fidelity}`,
    projectId: "project-001",
    workType,
    targetScope: ["structure"],
    requestedFidelity: fidelity,
    decisions: [`${workType}-decision`],
    consequenceOfError,
    evidence: sharedEvidence,
  };
}

test("acceptance-7: same evidence set yields different fitness when the task changes (feasibility vs structural)", () => {
  const registry = createProfileRegistry();
  registry.register(FEASIBILITY_PROFILE);
  registry.register(STRUCTURAL_PROFILE);

  // feasibility 任务：site-context=inferred + concept-scope=defaulted 可接受（acceptTags 含 inferred/defaulted）。
  const feasResolution = resolveProfile(registry, buildIntent("feasibility", "conceptual", "low"));
  assert.equal(feasResolution.status, "matched");
  const feasAssessment = assessSufficiency(
    buildIntent("feasibility", "conceptual", "low"),
    feasResolution.status === "matched" ? feasResolution.profile : FEASIBILITY_PROFILE,
  );
  assert.ok(
    feasAssessment.state === "READY" || feasAssessment.state === "CONDITIONALLY_READY",
    `feasibility should be READY/CONDITIONALLY_READY; got ${feasAssessment.state}`,
  );

  // structural 任务：缺失 load.dead/load.live/support-condition/material.property/code-input/analysis-combination
  // → 强制门缺失 + blockOnMissingMandatory=true → BLOCKED。
  const structResolution = resolveProfile(
    registry,
    buildIntent("structural", "analytical", "high"),
  );
  assert.equal(structResolution.status, "matched");
  const structAssessment = assessSufficiency(
    buildIntent("structural", "analytical", "high"),
    structResolution.status === "matched" ? structResolution.profile : STRUCTURAL_PROFILE,
  );
  assert.equal(structAssessment.state, "BLOCKED");
});

test("acceptance-7: assessSufficiency is pure (same inputs → same output)", () => {
  const intent = buildIntent("structural", "analytical", "high");
  const a1 = assessSufficiency(intent, STRUCTURAL_PROFILE);
  const a2 = assessSufficiency(intent, STRUCTURAL_PROFILE);
  assert.deepEqual(a1, a2);
});

test("acceptance-7: information requests are ranked by netVoI (descending)", () => {
  const requests: InformationRequest[] = [
    { kind: "low-impact", reason: "x", decisionImpactScore: 0.2, estimatedCost: 0.5 }, // netVoI = 0.1
    { kind: "high-impact-low-cost", reason: "y", decisionImpactScore: 0.9, estimatedCost: 0.1 }, // netVoI = 0.81
    { kind: "mid-impact", reason: "z", decisionImpactScore: 0.6, estimatedCost: 0.5 }, // netVoI = 0.3
  ];
  const ranked = rankInformationRequests(requests);
  assert.equal(ranked[0]?.kind, "high-impact-low-cost");
  assert.equal(ranked[1]?.kind, "mid-impact");
  assert.equal(ranked[2]?.kind, "low-impact");
  // netVoI 单调递减
  assert.ok(netVoI(ranked[0] ?? requests[0]) >= netVoI(ranked[1] ?? requests[1]));
  assert.ok(netVoI(ranked[1] ?? requests[1]) >= netVoI(ranked[2] ?? requests[2]));
});

test("acceptance-7: filterDecisionChanging drops low-decision-impact requests", () => {
  const requests: InformationRequest[] = [
    { kind: "keep-a", reason: "x", decisionImpactScore: 0.5, estimatedCost: 0.2 },
    { kind: "drop-b", reason: "y", decisionImpactScore: 0.05, estimatedCost: 0.1 }, // impact < 0.1 阈值
    { kind: "keep-c", reason: "z", decisionImpactScore: 0.3, estimatedCost: 0.5 },
  ];
  const filtered = filterDecisionChanging(requests, 0.1);
  const kinds = filtered.map((r) => r.kind);
  assert.ok(kinds.includes("keep-a"));
  assert.ok(kinds.includes("keep-c"));
  assert.ok(!kinds.includes("drop-b"), "low-impact request must be filtered out");
});

test("acceptance-7: sufficiency recalculation on task change requests only decision-changing evidence", () => {
  // 同一项目，从 feasibility（不阻塞）切到 structural（阻塞）：structural 任务的
  // 信息请求应只包含强制门缺失的 high-impact 请求（load.dead 等的
  // decisionImpactScore 因 consequenceOfError=high 与 analytical 而提升）。
  const structAssessment = assessSufficiency(
    buildIntent("structural", "analytical", "high"),
    STRUCTURAL_PROFILE,
  );
  assert.equal(structAssessment.state, "BLOCKED");
  // BLOCKED 状态下仍产出请求（供下游 VOI 排序参考）。
  for (const r of structAssessment.requests) {
    // structural 强制门的 decisionImpactScore 应较高（consequenceOfError=high ×1.3，
    // fidelity=analytical ×1.2 → base 0.6 * 1.3 * 1.2 ≈ 0.936；blockOnConflict +0.15 裁到 1）。
    assert.ok(
      r.decisionImpactScore > 0.1,
      `structural request "${r.kind}" must be decision-changing (impact=${r.decisionImpactScore})`,
    );
  }
});
