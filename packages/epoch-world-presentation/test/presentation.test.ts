/**
 * epoch-world-presentation 契约测试：守卫对合法/非法样例的接受与拒绝。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeWorldDigest } from "../../epoch-world-model/src/index.ts";
import {
  isInteractionBinding,
  isKnownWorldProjectionMode,
  isPortableRendererState,
  isPresentationNodeVisibility,
  isQuaternion,
  isRepresentationKind,
  isRepresentationRef,
  isTransform,
  isVec3,
  isWorldPresentation,
  isWorldPresentationNode,
  isWorldProjectionMode,
} from "../src/index.ts";

const validRepresentation = {
  representationId: "rep-001",
  kind: "mesh",
  format: "epoch.triangles@1",
  ref: "sha256:abcdef",
};

const validNode = {
  presentationId: "node-001",
  entityId: "column-001",
  parentPresentationId: "node-000",
  transform: {
    translation: { x: 1, y: 2, z: 3 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  },
  representations: [validRepresentation],
  visibility: "visible",
  interaction: { selectable: true, focusable: true, layerIds: ["structural"] },
};

test("isVec3 and isQuaternion accept/reject", () => {
  assert.equal(isVec3({ x: 0, y: 0, z: 0 }), true);
  assert.equal(isVec3({ x: 1, y: 2 }), false);
  assert.equal(isVec3({ x: "1", y: 2, z: 3 }), false);
  assert.equal(isVec3(Number.NaN), false);
  assert.equal(isQuaternion({ x: 0, y: 0, z: 0, w: 1 }), true);
  assert.equal(isQuaternion({ x: 0, y: 0, z: 0 }), false);
  assert.equal(isQuaternion(null), false);
});

test("isTransform validates translation and optional members", () => {
  assert.equal(isTransform({ translation: { x: 0, y: 0, z: 0 } }), true);
  assert.equal(
    isTransform({ translation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }),
    true,
  );
  assert.equal(isTransform({}), false);
  assert.equal(isTransform({ translation: null }), false);
  assert.equal(
    isTransform({ translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }),
    false,
  );
});

test("isRepresentationRef accepts frozen kinds only", () => {
  assert.equal(isRepresentationRef(validRepresentation), true);
  assert.equal(isRepresentationRef({ ...validRepresentation, kind: "hologram" }), false);
  assert.equal(isRepresentationRef({ ...validRepresentation, format: "" }), false);
  assert.equal(isRepresentationRef({ ...validRepresentation, ref: 42 }), false);
  assert.equal(isRepresentationKind("solid"), true);
  assert.equal(isRepresentationKind("generated-proxy"), true);
  assert.equal(isRepresentationKind("voxel"), false);
});

test("projection modes are an open enum", () => {
  // 已冻结内置模式。
  assert.equal(isKnownWorldProjectionMode("3d"), true);
  assert.equal(isKnownWorldProjectionMode("plan"), true);
  assert.equal(isKnownWorldProjectionMode("section-cutaway"), true);
  assert.equal(isKnownWorldProjectionMode("walk"), false);
  // 开放联合：未来的 walk/XR 模式是合法值。
  assert.equal(isWorldProjectionMode("walk"), true);
  assert.equal(isWorldProjectionMode("xr-vision"), true);
  assert.equal(isWorldProjectionMode(""), false);
  assert.equal(isWorldProjectionMode(3), false);
});

test("isInteractionBinding accepts/rejects", () => {
  assert.equal(isInteractionBinding({ selectable: true, focusable: false, layerIds: [] }), true);
  assert.equal(isInteractionBinding({ selectable: "yes", focusable: false, layerIds: [] }), false);
  assert.equal(isInteractionBinding({ selectable: true, focusable: false }), false);
  assert.equal(isInteractionBinding({ selectable: true, focusable: true, layerIds: [""] }), false);
  assert.equal(
    isInteractionBinding({ selectable: true, focusable: true, layerIds: "walls" }),
    false,
  );
});

test("isPresentationNodeVisibility accepts frozen values only", () => {
  assert.equal(isPresentationNodeVisibility("visible"), true);
  assert.equal(isPresentationNodeVisibility("hidden"), true);
  assert.equal(isPresentationNodeVisibility("dimmed"), false);
  assert.equal(isPresentationNodeVisibility(1), false);
});

test("isWorldPresentationNode accepts a valid node and rejects malformed ones", () => {
  assert.equal(isWorldPresentationNode(validNode), true);
  assert.equal(isWorldPresentationNode({ ...validNode, presentationId: "" }), false);
  assert.equal(isWorldPresentationNode({ ...validNode, transform: {} }), false);
  assert.equal(isWorldPresentationNode({ ...validNode, representations: "one" }), false);
  assert.equal(
    isWorldPresentationNode({
      ...validNode,
      representations: [{ ...validRepresentation, kind: "?" }],
    }),
    false,
  );
  assert.equal(isWorldPresentationNode({ ...validNode, visibility: "shown" }), false);
  assert.equal(isWorldPresentationNode({ ...validNode, interaction: null }), false);
  assert.equal(isWorldPresentationNode({ ...validNode, entityId: 7 }), false);
  assert.equal(isWorldPresentationNode(null), false);
});

test("isPortableRendererState validates the documented portable fields", () => {
  assert.equal(
    isPortableRendererState({
      worldId: "world-001",
      digest: "f9b0c90957ac2112afdc906056e7bda94a80eed1ad525273610be93e65ef905e",
    }),
    true,
  );
  assert.equal(
    isPortableRendererState({
      worldId: "world-001",
      digest: "abc",
      focusedEntityId: "column-001",
      hiddenLayerIds: ["hvac"],
      annotationRefs: ["ann-1"],
      measurementRefs: ["mea-1"],
      timelinePosition: 12.5,
      agentRefs: ["agent-1"],
      projectionMode: "plan",
    }),
    true,
  );
  assert.equal(isPortableRendererState({ digest: "abc" }), false);
  assert.equal(
    isPortableRendererState({ worldId: "w", digest: "abc", timelinePosition: "t+12" }),
    false,
  );
  assert.equal(
    isPortableRendererState({ worldId: "w", digest: "abc", hiddenLayerIds: [""] }),
    false,
  );
  assert.equal(isPortableRendererState({ worldId: "w", digest: "abc", projectionMode: "" }), false);
});

test("isWorldPresentation validates the compiled projection", () => {
  const revisionDigest = computeWorldDigest({
    worldId: "world-001",
    entities: [{ entityId: "column-001", entityType: "column", label: "C1" }],
    relationships: [],
  });
  const presentation = {
    worldId: "world-001",
    revisionId: "rev-001",
    digest: revisionDigest,
    projectionMode: "3d",
    nodes: [validNode],
  };
  assert.equal(isWorldPresentation(presentation), true);
  assert.equal(isWorldPresentation({ ...presentation, digest: "" }), false);
  assert.equal(isWorldPresentation({ ...presentation, projectionMode: "" }), false);
  assert.equal(isWorldPresentation({ ...presentation, nodes: [{}] }), false);
  assert.equal(isWorldPresentation(null), false);
});

test("package runtime dependencies are workspace-only epoch links", () => {
  const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const dependencies = (manifest.dependencies ?? {}) as Record<string, string>;
  for (const [name, range] of Object.entries(dependencies)) {
    assert.match(name, /^@zcode\/epoch-[a-z-]+$/);
    assert.equal(range, "workspace:*");
  }
  const devDependencies = Object.keys((manifest.devDependencies ?? {}) as Record<string, string>);
  const forbidden = /babylon|three|react|zod/i;
  assert.equal(
    devDependencies.some((name) => forbidden.test(name)),
    false,
  );
});
