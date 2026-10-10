/**
 * W027 验收点 8：agent 不可静默将推断/默认几何提升为确认事实。
 *
 * 断言：
 * - isConfirmableProvenance 仅对 confirmed/measured 返回 true。
 * - inferred/defaulted/disputed/unknown 不可被 confirmableProvenance 视为确认。
 * - 评估器在 satisfied 记录中原样保留证据的 inferenceTag（不静默改写）。
 * - profile 的 acceptTags 机制是 inference law 的类型核心强制点：
 *   acceptTags 不含 inferred 的强制门，即使证据存在也不满足（quality shortfall）。
 * - sufficiency 评估结果的 gaps/satisfied 项的 inferenceTag 严格来自证据原标签。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isConfirmableProvenance,
  BOQ_PROFILE,
  STRUCTURAL_PROFILE,
  assessSufficiency,
  isInferenceProvenanceTag,
} from "../src/index.ts";
import type { ReconstructionIntent } from "../src/index.ts";

test("acceptance-8: isConfirmableProvenance only accepts confirmed/measured", () => {
  assert.equal(isConfirmableProvenance("confirmed"), true);
  assert.equal(isConfirmableProvenance("measured"), true);
  assert.equal(isConfirmableProvenance("inferred"), false);
  assert.equal(isConfirmableProvenance("defaulted"), false);
  assert.equal(isConfirmableProvenance("disputed"), false);
  assert.equal(isConfirmableProvenance("unknown"), false);
});

test("acceptance-8: inferred geometry cannot be silently promoted to confirmed fact (acceptTags gate)", () => {
  // BOQ measurable-quantity 的 acceptTags 排除 inferred。
  const qtyReq = BOQ_PROFILE.requiredInputs.find((r) => r.kind === "measurable-quantity");
  assert.ok(qtyReq);
  assert.ok(!qtyReq.acceptTags.includes("inferred"));
  assert.ok(!qtyReq.acceptTags.includes("defaulted"));
  assert.ok(!qtyReq.acceptTags.includes("unknown"));
});

test("acceptance-8: structural load.acceptTags exclude inferred (no inferred load as analysis basis)", () => {
  const deadReq = STRUCTURAL_PROFILE.requiredInputs.find((r) => r.kind === "load.dead");
  assert.ok(deadReq);
  assert.ok(!deadReq.acceptTags.includes("inferred"));
  assert.ok(!deadReq.acceptTags.includes("defaulted"));
  assert.ok(!deadReq.acceptTags.includes("disputed"));
  assert.ok(!deadReq.acceptTags.includes("unknown"));
});

test("acceptance-8: satisfied records preserve original inferenceTag (no silent promotion)", () => {
  // 提供 measured 的 measurable-quantity + defaulted 的 assembly-assumption + confirmed 的 rate-source。
  const intent: ReconstructionIntent = {
    taskId: "task-boq-promotion-001",
    projectId: "project-001",
    workType: "boq",
    targetScope: ["structure"],
    requestedFidelity: "measurable",
    decisions: ["boq-class-3"],
    consequenceOfError: "medium",
    evidence: [
      {
        id: "qty-measured",
        kind: "measurable-quantity",
        provenance: {
          sourceKind: "measurement",
          sourceId: "takeoff-001",
          timestamp: "2024-06-01T10:00:00Z",
        },
        inferenceTag: "measured",
      },
      {
        id: "assm-defaulted",
        kind: "assembly-assumption",
        provenance: {
          sourceKind: "specification",
          sourceId: "spec-001",
          timestamp: "2024-06-01T11:00:00Z",
        },
        inferenceTag: "defaulted",
      },
      {
        id: "rate-confirmed",
        kind: "rate-source",
        provenance: {
          sourceKind: "document",
          sourceId: "tender-rates-2024-06",
          timestamp: "2024-06-15T09:00:00Z",
        },
        inferenceTag: "confirmed",
      },
    ],
  };
  const assessment = assessSufficiency(intent, BOQ_PROFILE);
  assert.equal(assessment.state, "READY");
  const qtySatisfied = assessment.satisfied.find((s) => s.kind === "measurable-quantity");
  assert.ok(qtySatisfied);
  assert.equal(
    qtySatisfied.inferenceTag,
    "measured",
    "measured evidence must remain measured in satisfied record",
  );
  const assmSatisfied = assessment.satisfied.find((s) => s.kind === "assembly-assumption");
  assert.ok(assmSatisfied);
  assert.equal(
    assmSatisfied.inferenceTag,
    "defaulted",
    "defaulted evidence must remain defaulted in satisfied record",
  );
  const rateSatisfied = assessment.satisfied.find((s) => s.kind === "rate-source");
  assert.ok(rateSatisfied);
  assert.equal(rateSatisfied.inferenceTag, "confirmed");
});

test("acceptance-8: gaps record the original inferenceTag of insufficient evidence", () => {
  // 提供一条 inferred 的 measurable-quantity（acceptTags 排除 inferred）→ 缺口记录 inferred 标签。
  const intent: ReconstructionIntent = {
    taskId: "task-boq-inferred-001",
    projectId: "project-001",
    workType: "boq",
    targetScope: ["structure"],
    requestedFidelity: "measurable",
    decisions: ["boq-class-3"],
    consequenceOfError: "medium",
    evidence: [
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
    ],
  };
  const assessment = assessSufficiency(intent, BOQ_PROFILE);
  const qtyGap = assessment.gaps.find((g) => g.kind === "measurable-quantity");
  assert.ok(qtyGap);
  assert.equal(qtyGap.inferenceTag, "inferred");
  assert.ok(isInferenceProvenanceTag(qtyGap.inferenceTag));
});

test("acceptance-8: InferenceProvenanceTag set is closed and enumerated (no silent new tags)", () => {
  // 验收点 8 的类型核心：inference tag 是闭合枚举，不可由 agent 自创。
  assert.ok(isInferenceProvenanceTag("confirmed"));
  assert.ok(isInferenceProvenanceTag("measured"));
  assert.ok(isInferenceProvenanceTag("inferred"));
  assert.ok(isInferenceProvenanceTag("defaulted"));
  assert.ok(isInferenceProvenanceTag("disputed"));
  assert.ok(isInferenceProvenanceTag("unknown"));
  assert.equal(isInferenceProvenanceTag("verified"), false);
  assert.equal(isInferenceProvenanceTag("final"), false);
  assert.equal(isInferenceProvenanceTag("approved"), false);
});
