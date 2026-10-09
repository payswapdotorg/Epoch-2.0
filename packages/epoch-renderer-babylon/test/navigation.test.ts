/**
 * epoch-renderer-babylon 导航数学测试（orbit/pan/zoom/frame/look-at/reset 的
 * 确定性断言；相机状态经白盒钩子读取）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBabylonRenderer } from "../src/index.ts";
import type { BabylonRendererSession } from "../src/session.ts";
import { getBabylonSessionInternals } from "../src/session.ts";
import { buildTestPresentation, type TestNodeSpec } from "./helpers.ts";

const VIEWPORT = { width: 800, height: 600 };

const SPECS: readonly TestNodeSpec[] = [
  {
    presentationId: "node-ground",
    entityId: "ground-001",
    translation: { x: 0, y: -0.15, z: 0 },
    box: { sizeX: 12, sizeY: 0.3, sizeZ: 10 },
    layerIds: ["site"],
    selectable: false,
    focusable: false,
  },
  {
    presentationId: "node-column-a",
    entityId: "column-001",
    translation: { x: 3, y: 1.5, z: 2 },
    box: { sizeX: 0.4, sizeY: 3, sizeZ: 0.4 },
    layerIds: ["structure"],
  },
  {
    presentationId: "node-wall",
    entityId: "wall-001",
    translation: { x: 0, y: 1.5, z: -3 },
    box: { sizeX: 8, sizeY: 3, sizeZ: 0.2 },
    layerIds: ["envelope"],
  },
];

async function mountSession(): Promise<BabylonRendererSession> {
  const renderer = createBabylonRenderer({ engineMode: "null", headlessViewport: VIEWPORT });
  const presentation = buildTestPresentation("world-nav", SPECS);
  return (await renderer.mount(presentation, { container: undefined })) as BabylonRendererSession;
}

test("orbit applies yaw/pitch deltas deterministically", async () => {
  const session = await mountSession();
  const { camera } = getBabylonSessionInternals(session)!;
  const alphaBefore = camera.alpha;
  const betaBefore = camera.beta;
  session.navigate({ kind: "orbit", deltaYawDeg: 30, deltaPitchDeg: 10 });
  assert.ok(Math.abs(camera.alpha - (alphaBefore + Math.PI / 6)) < 1e-12);
  assert.ok(Math.abs(camera.beta - (betaBefore + Math.PI / 18)) < 1e-12);
  session.navigate({ kind: "orbit", deltaYawDeg: 0, deltaPitchDeg: 0 });
  assert.ok(Math.abs(camera.alpha - (alphaBefore + Math.PI / 6)) < 1e-12);
  await session.dispose();
});

test("orbit pitch clamps away from the poles", async () => {
  const session = await mountSession();
  const { camera } = getBabylonSessionInternals(session)!;
  session.navigate({ kind: "orbit", deltaPitchDeg: -1000 });
  assert.ok(camera.beta > 0.005 && camera.beta < Math.PI - 0.005);
  session.navigate({ kind: "orbit", deltaPitchDeg: 1000 });
  assert.ok(camera.beta > 0.005 && camera.beta < Math.PI - 0.005);
  await session.dispose();
});

test("zoom divides the radius by the factor", async () => {
  const session = await mountSession();
  const { camera } = getBabylonSessionInternals(session)!;
  const radiusBefore = camera.radius;
  session.navigate({ kind: "zoom", factor: 2 });
  assert.ok(Math.abs(camera.radius - radiusBefore / 2) < 1e-9);
  session.navigate({ kind: "zoom", factor: 0.5 });
  assert.ok(Math.abs(camera.radius - radiusBefore) < 1e-9);
  // 非法/零因子按 1 处理（守卫层保证 factor 为有限数）。
  session.navigate({ kind: "zoom" });
  assert.ok(Math.abs(camera.radius - radiusBefore) < 1e-9);
  await session.dispose();
});

test("pan moves the target in screen plane and preserves orbit state", async () => {
  const session = await mountSession();
  const { camera } = getBabylonSessionInternals(session)!;
  const alphaBefore = camera.alpha;
  const betaBefore = camera.beta;
  const radiusBefore = camera.radius;
  const targetBefore = camera.getTarget().clone();
  session.navigate({ kind: "pan", deltaX: 100, deltaY: 0 });
  const delta = camera.getTarget().subtract(targetBefore);
  const worldPerPixel = (2 * radiusBefore * Math.tan(0.4)) / VIEWPORT.height;
  assert.ok(Math.abs(delta.length() - 100 * worldPerPixel) < 1e-6);
  assert.ok(Math.abs(camera.alpha - alphaBefore) < 1e-12);
  assert.ok(Math.abs(camera.beta - betaBefore) < 1e-12);
  assert.ok(Math.abs(camera.radius - radiusBefore) < 1e-12);
  await session.dispose();
});

test("look-at sets the camera target and optional position", async () => {
  const session = await mountSession();
  const { camera } = getBabylonSessionInternals(session)!;
  session.navigate({ kind: "look-at", target: { x: 3, y: 1.5, z: 2 } });
  const target = camera.getTarget();
  assert.ok(
    Math.abs(target.x - 3) < 1e-6 &&
      Math.abs(target.y - 1.5) < 1e-6 &&
      Math.abs(target.z - 2) < 1e-6,
  );
  session.navigate({
    kind: "look-at",
    target: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 30, z: -30 },
  });
  const position = camera.position;
  assert.ok(
    Math.abs(position.x - 0) < 1e-6 &&
      Math.abs(position.y - 30) < 1e-6 &&
      Math.abs(position.z + 30) < 1e-6,
  );
  await session.dispose();
});

test("frame without entityIds resets to the mount home view", async () => {
  const session = await mountSession();
  const { camera, home } = getBabylonSessionInternals(session)!;
  session.navigate({ kind: "orbit", deltaYawDeg: 90, deltaPitchDeg: 20 });
  session.navigate({ kind: "zoom", factor: 3 });
  session.navigate({ kind: "pan", deltaX: -80, deltaY: 40 });
  session.navigate({ kind: "frame" });
  assert.ok(Math.abs(camera.alpha - home.alpha) < 1e-9);
  assert.ok(Math.abs(camera.beta - home.beta) < 1e-9);
  assert.ok(Math.abs(camera.radius - home.radius) < 1e-9);
  const target = camera.getTarget();
  assert.ok(Math.abs(target.x - home.target.x) < 1e-9);
  assert.ok(Math.abs(target.y - home.target.y) < 1e-9);
  assert.ok(Math.abs(target.z - home.target.z) < 1e-9);
  await session.dispose();
});

test("frame with entityIds keeps orientation and frames the selection", async () => {
  const session = await mountSession();
  const { camera } = getBabylonSessionInternals(session)!;
  session.navigate({ kind: "orbit", deltaYawDeg: 45 });
  const alphaBefore = camera.alpha;
  session.navigate({ kind: "frame", entityIds: ["column-001"] });
  assert.ok(
    Math.abs(camera.alpha - alphaBefore) < 1e-12,
    "selection framing must keep orientation",
  );
  const target = camera.getTarget();
  assert.ok(Math.abs(target.x - 3) < 1e-6, "selection framing must center on the entity");
  assert.ok(Math.abs(target.y - 1.5) < 1e-6);
  assert.ok(Math.abs(target.z - 2) < 1e-6);
  await session.dispose();
});

test("frame with unknown entityIds is a safe no-op", async () => {
  const session = await mountSession();
  const { camera } = getBabylonSessionInternals(session)!;
  const radiusBefore = camera.radius;
  const targetBefore = camera.getTarget().clone();
  session.navigate({ kind: "frame", entityIds: ["missing-entity"] });
  assert.ok(Math.abs(camera.radius - radiusBefore) < 1e-12);
  assert.ok(camera.getTarget().subtract(targetBefore).length() < 1e-12);
  await session.dispose();
});
