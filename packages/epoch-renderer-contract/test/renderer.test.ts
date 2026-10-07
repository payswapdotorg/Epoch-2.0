/**
 * epoch-renderer-contract 契约测试：守卫对合法/非法样例的接受与拒绝。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isFocusInput,
  isHitTestInput,
  isInteractiveRenderer,
  isNavigationInput,
  isRendererCapabilities,
  isRendererDescriptor,
  isRendererHit,
  isRendererMountOptions,
  isRendererSession,
  isVec3,
  isVisibilityInput,
  isWellFormedRenderer,
} from "../src/index.ts";

const validDescriptor = {
  id: "epoch-renderer-babylon",
  name: "Babylon Renderer",
  version: "1.0.0",
  capabilities: {
    web: true,
    desktop: true,
    webgpu: true,
    webgl: true,
    hitTesting: true,
    plan: true,
    section: true,
    walk: false,
  },
};

test("isRendererDescriptor accepts a valid descriptor", () => {
  assert.equal(isRendererDescriptor(validDescriptor), true);
});

test("isRendererDescriptor rejects missing/wrong fields", () => {
  assert.equal(isRendererDescriptor({ ...validDescriptor, id: "" }), false);
  assert.equal(isRendererDescriptor({ ...validDescriptor, version: null }), false);
  assert.equal(isRendererDescriptor(null), false);
  assert.equal(isRendererDescriptor({ ...validDescriptor, capabilities: null }), false);
});

test("isRendererCapabilities validates mandatory and optional switches", () => {
  assert.equal(isRendererCapabilities(validDescriptor.capabilities), true);
  assert.equal(isRendererCapabilities({ web: true }), false);
  const { walk, ...withoutWalk } = validDescriptor.capabilities;
  assert.equal(isRendererCapabilities(withoutWalk), false);
  assert.equal(
    isRendererCapabilities({ ...validDescriptor.capabilities, webgpu: "maybe" }),
    false,
  );
});

test("isRendererHit accepts presentationId-first hits", () => {
  assert.equal(isRendererHit({ presentationId: "node-001" }), true);
  assert.equal(isRendererHit({ presentationId: "node-001", entityId: "column-001" }), true);
  assert.equal(isRendererHit({ presentationId: "node-001", point: { x: 1, y: 2, z: 3 } }), true);
  assert.equal(isRendererHit({}), false);
  assert.equal(isRendererHit({ presentationId: "" }), false);
  assert.equal(isRendererHit({ presentationId: "n", point: { x: 1, y: 2 } }), false);
  assert.equal(isRendererHit({ entityId: "column-001" }), false);
});

test("isNavigationInput accepts all five navigation kinds", () => {
  assert.equal(isNavigationInput({ kind: "orbit", deltaYawDeg: 10 }), true);
  assert.equal(isNavigationInput({ kind: "pan", deltaX: -5, deltaY: 3 }), true);
  assert.equal(isNavigationInput({ kind: "zoom", factor: 1.2 }), true);
  assert.equal(isNavigationInput({ kind: "frame", entityIds: ["column-001"] }), true);
  assert.equal(isNavigationInput({ kind: "frame" }), true);
  assert.equal(
    isNavigationInput({ kind: "look-at", target: { x: 0, y: 1, z: 0 } }),
    true,
  );
});

test("isNavigationInput rejects unknown kinds and malformed payloads", () => {
  assert.equal(isNavigationInput({ kind: "teleport" }), false);
  assert.equal(isNavigationInput({ kind: "orbit", deltaYawDeg: "10" }), false);
  assert.equal(isNavigationInput({ kind: "frame", entityIds: [""] }), false);
  assert.equal(isNavigationInput({ kind: "look-at", target: { x: 0, y: 0 } }), false);
  assert.equal(isNavigationInput(null), false);
  assert.equal(isNavigationInput("orbit"), false);
});

test("isHitTestInput / isVisibilityInput / isFocusInput validate shapes", () => {
  assert.equal(isHitTestInput({ x: 120, y: 80 }), true);
  assert.equal(isHitTestInput({ x: Number.NaN, y: 80 }), false);
  assert.equal(isHitTestInput({ x: "120", y: 80 }), false);
  assert.equal(isVisibilityInput({ layerId: "structural", visible: true }), true);
  assert.equal(isVisibilityInput({ layerId: "", visible: true }), false);
  assert.equal(isVisibilityInput({ layerId: "structural", visible: "yes" }), false);
  assert.equal(isFocusInput({}), true);
  assert.equal(isFocusInput({ entityId: "column-001" }), true);
  assert.equal(isFocusInput({ presentationId: "node-001" }), true);
  assert.equal(isFocusInput({ entityId: 5 }), false);
  assert.equal(isFocusInput({ presentationId: "" }), false);
});

test("isRendererMountOptions treats container as opaque but validates the rest", () => {
  assert.equal(isRendererMountOptions({ container: documentLike() }), true);
  assert.equal(isRendererMountOptions({ container: null }), true);
  assert.equal(isRendererMountOptions({}), false);
  assert.equal(
    isRendererMountOptions({ container: {}, devicePixelRatio: 2 }), true,
  );
  assert.equal(
    isRendererMountOptions({ container: {}, devicePixelRatio: 0 }),
    false,
  );
  assert.equal(
    isRendererMountOptions({
      container: {},
      portableState: { worldId: "w", digest: "abc", timelinePosition: "now" },
    }),
    false,
  );
});

function documentLike(): unknown {
  return { nodeType: 1, appendChild: () => undefined };
}

test("session and renderer structural guards", () => {
  const session = {
    navigate: () => undefined,
    hitTest: async () => null,
    setVisibility: () => undefined,
    focus: () => undefined,
    dispose: async () => undefined,
  };
  assert.equal(isRendererSession(session), true);
  assert.equal(isRendererSession({ ...session, dispose: null }), false);

  const renderer = {
    descriptor: () => validDescriptor,
    mount: async () => session,
  };
  assert.equal(isInteractiveRenderer(renderer), true);
  assert.equal(isWellFormedRenderer(renderer), true);
  assert.equal(
    isWellFormedRenderer({
      descriptor: () => ({ ...validDescriptor, capabilities: {} }),
      mount: async () => session,
    }),
    false,
  );
  assert.equal(isInteractiveRenderer({ descriptor: () => validDescriptor }), false);
  assert.equal(isInteractiveRenderer(null), false);
});

test("Vec3 is re-exported from the renderer contract", () => {
  assert.equal(isVec3({ x: 1, y: 2, z: 3 }), true);
  assert.equal(isVec3({ x: 1, y: 2 }), false);
});

test("package runtime dependencies are workspace-only epoch links", () => {
  const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const dependencies = (manifest.dependencies ?? {}) as Record<string, string>;
  for (const [name, range] of Object.entries(dependencies)) {
    assert.match(name, /^@zcode\/epoch-[a-z-]+$/);
    assert.equal(range, "workspace:*");
  }
  const devDependencies = Object.keys(
    (manifest.devDependencies ?? {}) as Record<string, string>,
  );
  const forbidden = /babylon|three|react|zod/i;
  assert.equal(devDependencies.some((name) => forbidden.test(name)), false);
});

test("renderer contract sources never import engine implementations", () => {
  // 源级断言：契约源码不得出现 Babylon/Three 导入（W001 验收）。
  const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
  const sources = readdirSync(srcDir).filter((name) => name.endsWith(".ts"));
  assert.ok(sources.length > 0);
  for (const name of sources) {
    const source = readFileSync(`${srcDir}${name}`, "utf8");
    assert.equal(
      /@babylonjs|from\s+["']three["']|require\s*\(\s*["']three["']\)/.test(source),
      false,
      `${name} must not import engine libraries`,
    );
  }
});
