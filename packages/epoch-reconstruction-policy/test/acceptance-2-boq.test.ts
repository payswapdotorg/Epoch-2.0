/**
 * W027 验收点 2：BOQ 需要可计量的量与可追溯的组装/单价假设（超出 feasibility）。
 *
 * 断言：
 * - BOQ profile 的强制门包含 measurable-quantity + assembly-assumption + rate-source。
 * - measurable-quantity 的 acceptTags 排除 inferred/defaulted（纯推断的量不可作为造价依据）。
 * - rate-source 必须可追溯（confirmed/measured），缺失时触发信息请求或阻塞。
 * - outputBounds.requiredAssumptionTags 含 rate-source-date / assembly-basis / estimate-class
 *   （可追溯假设）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOQ_PROFILE,
  assessSufficiency,
  resolveProfile,
  createProfileRegistry,
} from "../src/index.ts";
import type { ReconstructionIntent } from "../src/index.ts";

function buildBoqIntent(evidence: ReconstructionIntent["evidence"]): ReconstructionIntent {
  return {
    taskId: "task-boq-001",
    projectId: "project-001",
    workType: "boq",
    targetScope: ["structure"],
    requestedFidelity: "measurable",
    decisions: ["boq-class-3"],
    consequenceOfError: "medium",
    evidence,
  };
}

test("acceptance-2: BOQ profile requires measurable quantities + assembly + rate source", () => {
  assert.ok(
    BOQ_PROFILE.requiredInputs.some((r) => r.kind === "measurable-quantity" && r.required),
    "BOQ must require measurable-quantity",
  );
  assert.ok(BOQ_PROFILE.requiredInputs.some((r) => r.kind === "assembly-assumption" && r.required));
  assert.ok(BOQ_PROFILE.requiredInputs.some((r) => r.kind === "rate-source" && r.required));
});

test("acceptance-2: BOQ measurable-quantity does NOT accept inferred/defaulted (no inferred quantity as cost basis)", () => {
  const qtyReq = BOQ_PROFILE.requiredInputs.find((r) => r.kind === "measurable-quantity");
  assert.ok(qtyReq);
  assert.ok(!qtyReq.acceptTags.includes("inferred"));
  assert.ok(!qtyReq.acceptTags.includes("defaulted"));
  assert.ok(!qtyReq.acceptTags.includes("disputed"));
  assert.ok(!qtyReq.acceptTags.includes("unknown"));
});

test("acceptance-2: BOQ with measured quantity + traceable rate source is READY", () => {
  const registry = createProfileRegistry();
  registry.register(BOQ_PROFILE);
  const intent = buildBoqIntent([
    {
      id: "qty-1",
      kind: "measurable-quantity",
      provenance: {
        sourceKind: "measurement",
        sourceId: "takeoff-001",
        timestamp: "2024-06-01T10:00:00Z",
      },
      inferenceTag: "measured",
    },
    {
      id: "assm-1",
      kind: "assembly-assumption",
      provenance: {
        sourceKind: "specification",
        sourceId: "spec-001",
        timestamp: "2024-06-01T11:00:00Z",
      },
      inferenceTag: "defaulted",
    },
    {
      id: "rate-1",
      kind: "rate-source",
      provenance: {
        sourceKind: "document",
        sourceId: "tender-rates-2024-06",
        timestamp: "2024-06-15T09:00:00Z",
      },
      inferenceTag: "confirmed",
    },
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : BOQ_PROFILE,
  );
  assert.equal(assessment.state, "READY");
});

test("acceptance-2: BOQ with inferred quantity is NOT READY (inferred quantity cannot be cost basis)", () => {
  const registry = createProfileRegistry();
  registry.register(BOQ_PROFILE);
  // measurable-quantity 用 inferred 标签：质量不满足（acceptTags 排除 inferred）。
  const intent = buildBoqIntent([
    {
      id: "qty-inferred",
      kind: "measurable-quantity",
      provenance: {
        sourceKind: "engine",
        sourceId: "engine-est-001",
        timestamp: "2024-06-01T10:00:00Z",
      },
      inferenceTag: "inferred",
    },
    {
      id: "assm-1",
      kind: "assembly-assumption",
      provenance: {
        sourceKind: "specification",
        sourceId: "spec-001",
        timestamp: "2024-06-01T11:00:00Z",
      },
      inferenceTag: "defaulted",
    },
    {
      id: "rate-1",
      kind: "rate-source",
      provenance: {
        sourceKind: "document",
        sourceId: "tender-rates-2024-06",
        timestamp: "2024-06-15T09:00:00Z",
      },
      inferenceTag: "confirmed",
    },
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : BOQ_PROFILE,
  );
  assert.notEqual(assessment.state, "READY");
  // 缺口必须显式记为「inferred 不在 acceptTags」（验收点 8 在此也体现）。
  const qtyGap = assessment.gaps.find((g) => g.kind === "measurable-quantity");
  assert.ok(qtyGap, "must record a gap for measurable-quantity");
  assert.equal(qtyGap.inferenceTag, "inferred");
  assert.ok(qtyGap.required, "measurable-quantity gap must be marked required");
});

test("acceptance-2: BOQ output bounds require traceable assumption tags (rate-source-date, assembly-basis, estimate-class)", () => {
  const tags = BOQ_PROFILE.outputBounds.requiredAssumptionTags;
  assert.ok(tags.includes("rate-source-date"));
  assert.ok(tags.includes("assembly-basis"));
  assert.ok(tags.includes("estimate-class"));
});
