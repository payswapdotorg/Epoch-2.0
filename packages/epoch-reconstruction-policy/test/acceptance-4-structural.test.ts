/**
 * W027 验收点 4：结构分析在缺失强制荷载/支座/属性/代码输入时阻塞，除非显式
 * 标注 exploratory 且有界。
 *
 * 断言：
 * - structural profile 强制门包含 load.dead / load.live / support-condition /
 *   material.property / code-input / analysis-combination。
 * - 强制门的 acceptTags 严格排除 inferred/defaulted/disputed/unknown（结构荷载
 *   不允许纯推断）。
 * - 缺失任一强制门 → BLOCKED（blockOnMissingMandatory=true）。
 * - exploratory fidelity 时 structural profile 仍可解析（supportedFidelities 含
 *   exploratory），但 uncertainty.exploratoryBoundedOnly=true 表达「仅显式
 *   exploratory 边界内允许推断」。
 * - 高 consequenceOfError 任务触发 safetyCritical 标记。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STRUCTURAL_PROFILE,
  assessSufficiency,
  resolveProfile,
  createProfileRegistry,
} from "../src/index.ts";
import type { ReconstructionIntent } from "../src/index.ts";

function buildStructuralIntent(
  evidence: ReconstructionIntent["evidence"],
  overrides: Partial<ReconstructionIntent> = {},
): ReconstructionIntent {
  return {
    taskId: "task-structural-001",
    projectId: "project-001",
    workType: "structural",
    targetScope: ["structure"],
    requestedFidelity: "analytical",
    decisions: ["capacity-check"],
    consequenceOfError: "high",
    evidence,
    ...overrides,
  };
}

test("acceptance-4: structural profile blocks on missing mandatory loads/supports/properties/code", () => {
  const requiredKinds = STRUCTURAL_PROFILE.requiredInputs.map((r) => r.kind);
  for (const expected of [
    "load.dead",
    "load.live",
    "support-condition",
    "material.property",
    "code-input",
    "analysis-combination",
  ]) {
    assert.ok(requiredKinds.includes(expected), `structural profile must require ${expected}`);
  }
});

test("acceptance-4: structural mandatory inputs do NOT accept inferred/defaulted/disputed/unknown", () => {
  for (const r of STRUCTURAL_PROFILE.requiredInputs) {
    assert.ok(!r.acceptTags.includes("inferred"), `${r.kind} must not accept inferred`);
    assert.ok(!r.acceptTags.includes("unknown"), `${r.kind} must not accept unknown`);
    assert.ok(!r.acceptTags.includes("disputed"), `${r.kind} must not accept disputed`);
  }
  // load.dead / support-condition / material.property / code-input 必须排除 defaulted
  for (const kind of ["load.dead", "support-condition", "material.property", "code-input"]) {
    const r = STRUCTURAL_PROFILE.requiredInputs.find((req) => req.kind === kind);
    assert.ok(r, `missing ${kind}`);
    assert.ok(!r.acceptTags.includes("defaulted"), `${kind} must not accept defaulted`);
  }
});

test("acceptance-4: structural with all mandatory measured inputs is READY (safetyCritical flagged)", () => {
  const registry = createProfileRegistry();
  registry.register(STRUCTURAL_PROFILE);
  const intent = buildStructuralIntent([
    {
      id: "ld-1",
      kind: "load.dead",
      provenance: { sourceKind: "specification", sourceId: "spec-001" },
      inferenceTag: "confirmed",
    },
    {
      id: "ll-1",
      kind: "load.live",
      provenance: { sourceKind: "code", sourceId: "code-2024" },
      inferenceTag: "defaulted",
    },
    {
      id: "sc-1",
      kind: "support-condition",
      provenance: { sourceKind: "drawing", sourceId: "dwg-001" },
      inferenceTag: "confirmed",
    },
    {
      id: "mp-1",
      kind: "material.property",
      provenance: { sourceKind: "document", sourceId: "mat-cert-001" },
      inferenceTag: "measured",
    },
    {
      id: "ci-1",
      kind: "code-input",
      provenance: { sourceKind: "code", sourceId: "code-2024" },
      inferenceTag: "confirmed",
    },
    {
      id: "ac-1",
      kind: "analysis-combination",
      provenance: { sourceKind: "specification", sourceId: "load-combo-001" },
      inferenceTag: "confirmed",
    },
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : STRUCTURAL_PROFILE,
  );
  assert.equal(assessment.state, "READY");
  assert.equal(assessment.safetyCritical, true, "high consequenceOfError must flag safetyCritical");
});

test("acceptance-4: structural missing any mandatory load BLOCKS (unsafe conclusions blocked)", () => {
  const registry = createProfileRegistry();
  registry.register(STRUCTURAL_PROFILE);
  // 缺失 load.dead：必须阻塞。
  const intent = buildStructuralIntent([
    {
      id: "ll-1",
      kind: "load.live",
      provenance: { sourceKind: "code", sourceId: "code-2024" },
      inferenceTag: "defaulted",
    },
    {
      id: "sc-1",
      kind: "support-condition",
      provenance: { sourceKind: "drawing", sourceId: "dwg-001" },
      inferenceTag: "confirmed",
    },
    {
      id: "mp-1",
      kind: "material.property",
      provenance: { sourceKind: "document", sourceId: "mat-cert-001" },
      inferenceTag: "measured",
    },
    {
      id: "ci-1",
      kind: "code-input",
      provenance: { sourceKind: "code", sourceId: "code-2024" },
      inferenceTag: "confirmed",
    },
    {
      id: "ac-1",
      kind: "analysis-combination",
      provenance: { sourceKind: "specification", sourceId: "load-combo-001" },
      inferenceTag: "confirmed",
    },
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : STRUCTURAL_PROFILE,
  );
  assert.equal(assessment.state, "BLOCKED");
  const deadGap = assessment.gaps.find((g) => g.kind === "load.dead");
  assert.ok(deadGap, "must record a gap for missing load.dead");
  assert.equal(deadGap.inferenceTag, "unknown");
  assert.equal(deadGap.required, true);
});

test("acceptance-4: structural with inferred load is BLOCKED (inferred load cannot be analysis basis)", () => {
  const registry = createProfileRegistry();
  registry.register(STRUCTURAL_PROFILE);
  // load.dead 用 inferred 标签：acceptTags 排除 inferred → 质量不满足 → BLOCKED。
  const intent = buildStructuralIntent([
    {
      id: "ld-inferred",
      kind: "load.dead",
      provenance: { sourceKind: "engine", sourceId: "est-001" },
      inferenceTag: "inferred",
    },
    {
      id: "ll-1",
      kind: "load.live",
      provenance: { sourceKind: "code", sourceId: "code-2024" },
      inferenceTag: "defaulted",
    },
    {
      id: "sc-1",
      kind: "support-condition",
      provenance: { sourceKind: "drawing", sourceId: "dwg-001" },
      inferenceTag: "confirmed",
    },
    {
      id: "mp-1",
      kind: "material.property",
      provenance: { sourceKind: "document", sourceId: "mat-cert-001" },
      inferenceTag: "measured",
    },
    {
      id: "ci-1",
      kind: "code-input",
      provenance: { sourceKind: "code", sourceId: "code-2024" },
      inferenceTag: "confirmed",
    },
    {
      id: "ac-1",
      kind: "analysis-combination",
      provenance: { sourceKind: "specification", sourceId: "load-combo-001" },
      inferenceTag: "confirmed",
    },
  ]);
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  const assessment = assessSufficiency(
    intent,
    resolution.status === "matched" ? resolution.profile : STRUCTURAL_PROFILE,
  );
  assert.equal(assessment.state, "BLOCKED");
  const deadGap = assessment.gaps.find((g) => g.kind === "load.dead");
  assert.ok(deadGap);
  assert.equal(deadGap.inferenceTag, "inferred");
});

test("acceptance-4: structural supports exploratory fidelity (bounded exploratory allowed)", () => {
  // 验收点 4 的「unless explicitly marked exploratory and bounded」：structural profile
  // 的 supportedFidelities 必须包含 exploratory，且 uncertainty.exploratoryBoundedOnly=true。
  assert.ok(STRUCTURAL_PROFILE.supportedFidelities.includes("exploratory"));
  assert.equal(STRUCTURAL_PROFILE.uncertainty.exploratoryBoundedOnly, true);
});

test("acceptance-4: structural exploratory intent resolves (not miss)", () => {
  const registry = createProfileRegistry();
  registry.register(STRUCTURAL_PROFILE);
  const intent = buildStructuralIntent(
    [
      {
        id: "ld-1",
        kind: "load.dead",
        provenance: { sourceKind: "specification", sourceId: "spec-001" },
        inferenceTag: "confirmed",
      },
      {
        id: "ll-1",
        kind: "load.live",
        provenance: { sourceKind: "code", sourceId: "code-2024" },
        inferenceTag: "defaulted",
      },
      {
        id: "sc-1",
        kind: "support-condition",
        provenance: { sourceKind: "drawing", sourceId: "dwg-001" },
        inferenceTag: "confirmed",
      },
      {
        id: "mp-1",
        kind: "material.property",
        provenance: { sourceKind: "document", sourceId: "mat-cert-001" },
        inferenceTag: "measured",
      },
      {
        id: "ci-1",
        kind: "code-input",
        provenance: { sourceKind: "code", sourceId: "code-2024" },
        inferenceTag: "confirmed",
      },
      {
        id: "ac-1",
        kind: "analysis-combination",
        provenance: { sourceKind: "specification", sourceId: "load-combo-001" },
        inferenceTag: "confirmed",
      },
    ],
    { requestedFidelity: "exploratory" },
  );
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  assert.equal(resolution.fallback, false);
});
