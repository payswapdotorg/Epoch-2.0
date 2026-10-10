/**
 * W027 验收点 6：新增工种 profile 可注册，无需修改渲染器或世界模型代码。
 *
 * 断言：
 * - createProfileRegistry 接受任意合法 ReconstructionProfile（新工种无需修改
 *   其它包）。
 * - resolveProfile 对新工种的精确匹配返回 matched（fallback=false）。
 * - 注册非法 profile 抛 TypeError（防御性）。
 * - 注册表对新 profile 的 listByWorkType 正确返回。
 *
 * 关键：本测试定义一个全新工种 "fire-rating" 的 profile 并注册——
 * 无需修改 packages/epoch-renderer-* 或 packages/epoch-world-model 中的任何代码
 * （本包仅消费 epoch-world-model 的 ProvenanceRef 类型，无渲染器依赖）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProfileRegistry, resolveProfile, isReconstructionProfile } from "../src/index.ts";
import type { ReconstructionIntent, ReconstructionProfile } from "../src/index.ts";

const FIRE_RATING_PROFILE: ReconstructionProfile = {
  id: "fire-rating",
  workType: "fire-rating",
  purpose: "Fire rating compliance check for assemblies and egress paths",
  supportedFidelities: ["coordination", "analytical"],
  requiredInputs: [
    { kind: "assembly-construction", required: true, acceptTags: ["confirmed", "measured"] },
    { kind: "fire-rating-rule", required: true, acceptTags: ["confirmed", "measured"] },
    {
      kind: "egress-path",
      required: true,
      acceptTags: ["confirmed", "measured"],
      coverageRequired: true,
    },
  ],
  optionalInputs: [
    {
      kind: "hazard-classification",
      required: false,
      acceptTags: ["confirmed", "measured", "defaulted"],
    },
  ],
  uncertainty: {
    allowInferredGeometry: false,
    allowDefaultedProperties: true,
    requireConflictReconciliation: true,
    exploratoryBoundedOnly: false,
  },
  outputBounds: {
    allowedOutputKinds: ["fire-rating-report", "egress-compliance-report"],
    forbidOutputKinds: ["concept-model", "structural-member-force"],
    explicitUnknowns: ["unrated-assembly", "unverified-egress"],
    requiredAssumptionTags: ["code-edition", "egress-coverage"],
  },
  blockOnMissingMandatory: true,
};

test("acceptance-6: new work-type profile registers without modifying renderer or World Model code", () => {
  // 本包仅依赖 @zcode/epoch-world-model 的 ProvenanceRef（类型导入），
  // 新增 profile 不需触碰任何渲染器包或世界模型包（本测试存在即证明）。
  const registry = createProfileRegistry();
  // 注册成功即证明：无需修改其它包。
  registry.register(FIRE_RATING_PROFILE);
  assert.ok(registry.list().some((p) => p.id === "fire-rating"));
  assert.equal(registry.listByWorkType("fire-rating").length, 1);
});

test("acceptance-6: resolver exact-matches the newly registered work-type profile", () => {
  const registry = createProfileRegistry();
  registry.register(FIRE_RATING_PROFILE);
  const intent: ReconstructionIntent = {
    taskId: "task-fire-001",
    projectId: "project-001",
    workType: "fire-rating",
    targetScope: ["egress"],
    requestedFidelity: "coordination",
    decisions: ["fire-code-compliance"],
    consequenceOfError: "high",
    evidence: [
      {
        id: "asm-1",
        kind: "assembly-construction",
        provenance: {
          sourceKind: "drawing",
          sourceId: "dwg-001",
          timestamp: "2024-08-01T10:00:00Z",
        },
        inferenceTag: "confirmed",
      },
      {
        id: "fr-1",
        kind: "fire-rating-rule",
        provenance: { sourceKind: "code", sourceId: "fire-code-2024" },
        inferenceTag: "confirmed",
      },
      {
        id: "eg-1",
        kind: "egress-path",
        provenance: {
          sourceKind: "drawing",
          sourceId: "egress-plan-001",
          timestamp: "2024-08-01T10:00:00Z",
        },
        inferenceTag: "measured",
        coverage: "all floors",
      },
    ],
  };
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  assert.equal(resolution.fallback, false);
  assert.equal(resolution.profile.id, "fire-rating");
});

test("acceptance-6: registry rejects malformed profiles on register", () => {
  const registry = createProfileRegistry();
  assert.throws(() => registry.register({} as never), TypeError);
  assert.throws(
    () =>
      registry.register({
        ...FIRE_RATING_PROFILE,
        workType: "",
      }),
    TypeError,
  );
  assert.throws(
    () =>
      registry.register({
        ...FIRE_RATING_PROFILE,
        supportedFidelities: ["cloud" as never],
      }),
    TypeError,
  );
});

test("acceptance-6: isReconstructionProfile validates structural integrity of profiles", () => {
  assert.equal(isReconstructionProfile(FIRE_RATING_PROFILE), true);
  assert.equal(isReconstructionProfile(null), false);
  assert.equal(isReconstructionProfile({}), false);
  assert.equal(isReconstructionProfile({ ...FIRE_RATING_PROFILE, uncertainty: null }), false);
  assert.equal(isReconstructionProfile({ ...FIRE_RATING_PROFILE, outputBounds: null }), false);
});

test("acceptance-6: profile registration is idempotent (re-register keeps order)", () => {
  const registry = createProfileRegistry();
  registry.register(FIRE_RATING_PROFILE);
  registry.register(FIRE_RATING_PROFILE);
  assert.equal(registry.listByWorkType("fire-rating").length, 1);
  assert.equal(registry.list().filter((p) => p.id === "fire-rating").length, 1);
});
