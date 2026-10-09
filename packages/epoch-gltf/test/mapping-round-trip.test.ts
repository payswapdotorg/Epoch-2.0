/**
 * @zcode/epoch-gltf 稳定映射律 round-trip 测试。
 *
 * 依据 W010 任务包「Stable mapping law」+ ARCHITECTURE-LOCK #11：
 * 每个 glTF 节点/基本图元 extras.epoch 必须保留 presentationId（及已知时的 entityId）；
 * round-trip 校验证明 1:1 映射——无丢弃、无重命名、跨重复编译稳定。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compilePresentationToGltf, extractMapping, isGltfArtifact } from "../src/index.ts";
import {
  buildSamplePresentation,
  expectedEntityIds,
  expectedPresentationIds,
  expectedUnresolved,
} from "./presentation-fixture.ts";

test("mapping: artifact is a valid GltfArtifact", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  assert.equal(isGltfArtifact(artifact), true, "isGltfArtifact must accept compile output");
});

test("mapping: round-trip extractMapping preserves every presentationId 1:1 (no drops)", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const extracted = extractMapping(artifact);
  assert.ok(extracted, "extractMapping must return a table");
  const extractedIds = extracted!.nodes.map((n) => n.presentationId).sort();
  const expectedIds = [...expectedPresentationIds()].sort();
  assert.deepEqual(extractedIds, expectedIds, "every input presentationId must survive round-trip");
});

test("mapping: round-trip preserves entityId where present (semantic identity)", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const extracted = extractMapping(artifact)!;
  const byId = new Map(extracted.nodes.map((n) => [n.presentationId, n]));
  for (const exp of expectedEntityIds()) {
    const node = byId.get(exp.presentationId);
    assert.ok(node, `extracted missing node ${exp.presentationId}`);
    assert.equal(node!.entityId, exp.entityId, `entityId mismatch for ${exp.presentationId}`);
  }
});

test("mapping: round-trip preserves parentPresentationId hierarchy", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const extracted = extractMapping(artifact)!;
  const byId = new Map(extracted.nodes.map((n) => [n.presentationId, n]));
  const child = byId.get("node-child-a");
  assert.equal(child?.parentPresentationId, "node-root", "child-a parent must be node-root");
  const childB = byId.get("node-child-b");
  assert.equal(childB?.parentPresentationId, "node-root", "child-b parent must be node-root");
  const root = byId.get("node-root");
  assert.equal(root?.parentPresentationId, undefined, "root has no parent");
});

test("mapping: round-trip preserves representationId per node", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const extracted = extractMapping(artifact)!;
  const byId = new Map(extracted.nodes.map((n) => [n.presentationId, n]));
  const root = byId.get("node-root");
  assert.ok(root, "root node must exist");
  assert.equal(root!.representations.length, 1, "root has 1 resolved rep (box)");
  assert.equal(root!.representations[0]?.representationId, "node-root-rep-box");
  assert.equal(root!.representations[0]?.resolved, true);
  const childA = byId.get("node-child-a");
  assert.equal(childA!.representations.length, 1, "child-a has 1 resolved rep (triangles)");
  assert.equal(childA!.representations[0]?.representationId, "node-child-a-rep-tri");
  const childB = byId.get("node-child-b");
  assert.equal(childB!.representations.length, 1, "child-b has 1 resolved rep (linework)");
  assert.equal(childB!.representations[0]?.representationId, "node-child-b-rep-line");
});

test("mapping: unresolved representations are recorded (no silent drops)", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const unresolved = artifact.mapping.unresolvedRepresentations;
  assert.equal(unresolved.length, expectedUnresolved().length, "exactly 1 unresolved rep expected");
  const exp = expectedUnresolved()[0]!;
  const got = unresolved[0];
  assert.equal(got.presentationId, exp.presentationId);
  assert.equal(got.representationId, exp.representationId);
  assert.equal(got.kind, exp.kind);
  assert.equal(got.format, exp.format);
  assert.ok(got.reason.length > 0, "unresolved must carry a reason");
});

test("mapping: round-trip is stable across repeated compiles", () => {
  const p = buildSamplePresentation();
  const e1 = extractMapping(compilePresentationToGltf(p))!;
  const e2 = extractMapping(compilePresentationToGltf(p))!;
  // Deep structural equality of the extracted mapping.
  assert.deepEqual(
    e1.nodes.map((n) => n.presentationId),
    e2.nodes.map((n) => n.presentationId),
  );
  assert.deepEqual(
    e1.nodes.flatMap((n) => n.representations.map((r) => r.representationId)),
    e2.nodes.flatMap((n) => n.representations.map((r) => r.representationId)),
  );
  assert.deepEqual(e1.unresolvedRepresentations, e2.unresolvedRepresentations);
});

test("mapping: scene extras preserve worldId/revisionId/digest/projectionMode", () => {
  const presentation = buildSamplePresentation();
  const artifact = compilePresentationToGltf(presentation);
  const extracted = extractMapping(artifact)!;
  assert.equal(extracted.worldId, "world-test-010");
  assert.equal(extracted.revisionId, "rev-001");
  assert.equal(extracted.projectionMode, "3d");
  assert.equal(extracted.digest, (presentation as { digest: string }).digest);
});
