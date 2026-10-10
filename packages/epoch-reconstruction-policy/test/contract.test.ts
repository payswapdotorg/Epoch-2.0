/**
 * epoch-reconstruction-policy 契约测试：类型守卫 + 注册表工厂 + 解析器语义。
 *
 * 参考 W002/W004 布局：结构守卫、注册表行为、解析器（exact/fallback/MISS）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FEASIBILITY_PROFILE,
  BOQ_PROFILE,
  CLASH_PROFILE,
  STRUCTURAL_PROFILE,
  SITE_VERIFICATION_PROFILE,
  INITIAL_PROFILES,
  createProfileRegistry,
  resolveProfile,
  isValidResolutionIntent,
  isReconstructionIntent,
  isReconstructionProfile,
  isEvidenceDescriptor,
  isEvidenceProvenance,
  isSufficiencyAssessment,
  isFidelityLevel,
  isFitnessState,
  isInformationRequest,
  isInferenceProvenanceTag,
  isEvidenceSourceKind,
  assessSufficiency,
} from "../src/index.ts";
import type { ReconstructionIntent } from "../src/index.ts";

function minimalIntent(): ReconstructionIntent {
  return {
    taskId: "task-001",
    projectId: "project-001",
    workType: "feasibility",
    targetScope: ["site-A"],
    requestedFidelity: "conceptual",
    decisions: ["concept-selection"],
    consequenceOfError: "low",
    evidence: [],
  };
}

test("package declares zero runtime dependencies except epoch-world-model", () => {
  const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(manifest.dependencies, {
    "@zcode/epoch-world-model": "workspace:*",
  });
  const devDeps = Object.keys((manifest.devDependencies ?? {}) as Record<string, string>);
  const forbidden = /babylon|three|react|zod|electron/i;
  assert.equal(
    devDeps.some((name) => forbidden.test(name)),
    false,
  );
});

test("INITIAL_PROFILES contains the five required profiles", () => {
  const ids = INITIAL_PROFILES.map((p) => p.id);
  assert.ok(ids.includes("feasibility"));
  assert.ok(ids.includes("boq"));
  assert.ok(ids.includes("clash"));
  assert.ok(ids.includes("structural"));
  assert.ok(ids.includes("site-verification"));
  assert.equal(INITIAL_PROFILES.length, 5);
});

test("registry registers, resolves and lists profiles", () => {
  const registry = createProfileRegistry();
  for (const p of INITIAL_PROFILES) registry.register(p);
  assert.deepEqual(
    registry.list().map((p) => p.id),
    ["feasibility", "boq", "clash", "structural", "site-verification"],
  );
  assert.equal(registry.get("feasibility").id, "feasibility");
});

test("registry get throws for unknown ids", () => {
  const registry = createProfileRegistry();
  assert.throws(() => registry.get("missing"), /not registered/);
});

test("registry rejects malformed profiles on register", () => {
  const registry = createProfileRegistry();
  assert.throws(() => registry.register({} as never), TypeError);
  assert.throws(() => registry.register({ ...FEASIBILITY_PROFILE, workType: "" }), TypeError);
  assert.throws(
    () =>
      registry.register({
        ...FEASIBILITY_PROFILE,
        supportedFidelities: ["cloud" as never],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      registry.register({
        ...FEASIBILITY_PROFILE,
        uncertainty: { ...FEASIBILITY_PROFILE.uncertainty, allowInferredGeometry: "yes" as never },
      }),
    TypeError,
  );
});

test("registry re-registration is idempotent and keeps order", () => {
  const registry = createProfileRegistry();
  registry.register(FEASIBILITY_PROFILE);
  registry.register(BOQ_PROFILE);
  registry.register(FEASIBILITY_PROFILE);
  assert.deepEqual(
    registry.list().map((p) => p.id),
    ["feasibility", "boq"],
  );
});

test("registry listByWorkType filters correctly", () => {
  const registry = createProfileRegistry();
  for (const p of INITIAL_PROFILES) registry.register(p);
  assert.equal(registry.listByWorkType("feasibility").length, 1);
  assert.equal(registry.listByWorkType("nonexistent").length, 0);
});

test("resolver exact-matches workType + fidelity", () => {
  const registry = createProfileRegistry();
  for (const p of INITIAL_PROFILES) registry.register(p);
  const intent = minimalIntent();
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "matched");
  assert.equal(resolution.fallback, false);
  assert.equal(resolution.profile.id, "feasibility");
});

test("resolver falls back to nearest-purpose when fidelity not supported", () => {
  const registry = createProfileRegistry();
  registry.register(FEASIBILITY_PROFILE); // supportedFidelities: exploratory, conceptual
  // 请求 measurable fidelity（feasibility 不支持）→ fallback
  const intent: ReconstructionIntent = {
    ...minimalIntent(),
    requestedFidelity: "measurable",
    workType: "feasibility",
  };
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "fallback");
  assert.equal(resolution.fallback, true);
  assert.equal(resolution.profile.id, "feasibility");
  assert.ok(
    resolution.reason.includes("selected"),
    `fallback reason must explain the selection: ${resolution.reason}`,
  );
});

test("resolver returns honest MISS when no profile for workType", () => {
  const registry = createProfileRegistry();
  registry.register(FEASIBILITY_PROFILE);
  const intent: ReconstructionIntent = {
    ...minimalIntent(),
    workType: "nonexistent-work-type",
  };
  const resolution = resolveProfile(registry, intent);
  assert.equal(resolution.status, "miss");
  assert.ok(resolution.reason.includes("no profile"));
});

test("isValidResolutionIntent validates required fields", () => {
  assert.equal(isValidResolutionIntent(minimalIntent()), true);
  assert.equal(isValidResolutionIntent({}), false);
  assert.equal(isValidResolutionIntent(null), false);
  assert.equal(isValidResolutionIntent({ ...minimalIntent(), workType: "" }), false);
  assert.equal(isValidResolutionIntent({ ...minimalIntent(), requestedFidelity: "cloud" }), false);
});

test("isReconstructionIntent validates full intent structure", () => {
  assert.equal(isReconstructionIntent(minimalIntent()), true);
  assert.equal(isReconstructionIntent(null), false);
  assert.equal(isReconstructionIntent({}), false);
  assert.equal(isReconstructionIntent({ ...minimalIntent(), taskId: "" }), false);
  assert.equal(isReconstructionIntent({ ...minimalIntent(), projectId: "" }), false);
  assert.equal(isReconstructionIntent({ ...minimalIntent(), targetScope: [123] as never }), false);
  assert.equal(
    isReconstructionIntent({ ...minimalIntent(), consequenceOfError: "extreme" as never }),
    false,
  );
});

test("isReconstructionProfile validates full profile structure", () => {
  assert.equal(isReconstructionProfile(FEASIBILITY_PROFILE), true);
  assert.equal(isReconstructionProfile(BOQ_PROFILE), true);
  assert.equal(isReconstructionProfile(CLASH_PROFILE), true);
  assert.equal(isReconstructionProfile(STRUCTURAL_PROFILE), true);
  assert.equal(isReconstructionProfile(SITE_VERIFICATION_PROFILE), true);
  assert.equal(isReconstructionProfile(null), false);
  assert.equal(isReconstructionProfile({}), false);
  assert.equal(isReconstructionProfile({ ...FEASIBILITY_PROFILE, uncertainty: null }), false);
  assert.equal(isReconstructionProfile({ ...FEASIBILITY_PROFILE, outputBounds: null }), false);
  assert.equal(
    isReconstructionProfile({ ...FEASIBILITY_PROFILE, blockOnMissingMandatory: "yes" as never }),
    false,
  );
});

test("isEvidenceDescriptor / isEvidenceProvenance validate evidence structure", () => {
  assert.equal(
    isEvidenceDescriptor({
      id: "e1",
      kind: "photo",
      provenance: { sourceKind: "photo", sourceId: "p1", timestamp: "2024-01-01T00:00:00Z" },
      inferenceTag: "confirmed",
    }),
    true,
  );
  assert.equal(isEvidenceDescriptor(null), false);
  assert.equal(
    isEvidenceDescriptor({ id: "", kind: "photo", provenance: {}, inferenceTag: "confirmed" }),
    false,
  );
  assert.equal(
    isEvidenceDescriptor({
      id: "e1",
      kind: "photo",
      provenance: { sourceKind: "photo", sourceId: "p1" },
      inferenceTag: "not-a-real-tag",
    }),
    false,
  );
  assert.equal(
    isEvidenceProvenance({ sourceKind: "photo", sourceId: "p1", timestamp: "2024-01-01" }),
    true,
  );
  assert.equal(isEvidenceProvenance({ sourceKind: "unknown-kind", sourceId: "p1" }), false);
  assert.equal(isEvidenceProvenance({ sourceKind: "photo", sourceId: "" }), false);
});

test("isFidelityLevel / isFitnessState / isInferenceProvenanceTag / isEvidenceSourceKind guards", () => {
  assert.equal(isFidelityLevel("exploratory"), true);
  assert.equal(isFidelityLevel("cloud"), false);
  assert.equal(isFitnessState("READY"), true);
  assert.equal(isFitnessState("PENDING"), false);
  assert.equal(isInferenceProvenanceTag("confirmed"), true);
  assert.equal(isInferenceProvenanceTag("approved"), false);
  assert.equal(isEvidenceSourceKind("photo"), true);
  assert.equal(isEvidenceSourceKind("satellite"), false);
});

test("isInformationRequest validates request structure", () => {
  assert.equal(
    isInformationRequest({
      kind: "load.dead",
      reason: "missing",
      decisionImpactScore: 0.6,
      estimatedCost: 0.5,
    }),
    true,
  );
  assert.equal(
    isInformationRequest({ kind: "", reason: "x", decisionImpactScore: 0.6, estimatedCost: 0.5 }),
    false,
  );
  assert.equal(
    isInformationRequest({ kind: "x", reason: "y", decisionImpactScore: -1, estimatedCost: 0.5 }),
    false,
  );
  assert.equal(
    isInformationRequest({ kind: "x", reason: "y", decisionImpactScore: 0.6, estimatedCost: 1.5 }),
    false,
  );
});

test("isSufficiencyAssessment validates the full assessment object", () => {
  const intent = minimalIntent();
  const assessment = assessSufficiency(intent, FEASIBILITY_PROFILE);
  assert.equal(isSufficiencyAssessment(assessment), true);
  assert.equal(isSufficiencyAssessment(null), false);
  assert.equal(isSufficiencyAssessment({ ...assessment, state: "PENDING" }), false);
});
