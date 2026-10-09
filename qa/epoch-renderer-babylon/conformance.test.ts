/**
 * W004 渲染器适配器一致性测试（qa/epoch-renderer-babylon）。
 *
 * 纯契约面：只通过公共入口 @zcode/epoch-renderer-babylon 的导出驱动适配器
 * （不 import @babylonjs、不 import 包内部模块）。引擎为 Babylon NullEngine
 * ——真实适配器代码路径（场景构建、CPU 射线-网格求交、相机数学），只是
 * 不产生 GPU 帧；视觉证明属 W005–W007。
 *
 * 点击坐标来源：粗粒度视口扫描 + 命中点世界 AABB 包含验证（点击↔实体
 * 绑定的几何证明，非循环验证——见 presentation-fixture 的 EXPECTED_CLICKABLE）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBabylonRenderer,
  isRendererDescriptor,
  isRendererHit,
  isRendererSession,
  isWellFormedRenderer,
} from "../../packages/epoch-renderer-babylon/src/index.ts";
import type {
  RendererHit,
  RendererSession,
} from "../../packages/epoch-renderer-babylon/src/index.ts";
import {
  buildFixturePresentation,
  EXPECTED_CLICKABLE,
  EXPECTED_UNCLICKABLE,
  HEADLESS_VIEWPORT,
  pointInsideAabb,
} from "./presentation-fixture.ts";

interface ResizableSession extends RendererSession {
  resize(): void;
}

async function mountFreshSession(): Promise<ResizableSession> {
  const renderer = createBabylonRenderer({
    engineMode: "null",
    headlessViewport: HEADLESS_VIEWPORT,
  });
  const session = await renderer.mount(buildFixturePresentation(), { container: undefined });
  return session as ResizableSession;
}

async function scanClick(
  session: RendererSession,
): Promise<Map<string, { x: number; y: number; hit: RendererHit }>> {
  const found = new Map<string, { x: number; y: number; hit: RendererHit }>();
  for (let y = 0; y < HEADLESS_VIEWPORT.height; y += 4) {
    for (let x = 0; x < HEADLESS_VIEWPORT.width; x += 4) {
      const hit = await session.hitTest({ x, y });
      if (!hit) continue;
      const key = hit.entityId ?? hit.presentationId;
      if (!found.has(key)) found.set(key, { x, y, hit });
    }
  }
  return found;
}

test("adapter satisfies the frozen contract guards", async () => {
  const renderer = createBabylonRenderer({ engineMode: "null" });
  assert.equal(isWellFormedRenderer(renderer), true);
  const descriptor = renderer.descriptor();
  assert.equal(isRendererDescriptor(descriptor), true);
  assert.equal(descriptor.id, "epoch-renderer-babylon");
  assert.equal(descriptor.capabilities.hitTesting, true);
  const session = await mountFreshSession();
  assert.equal(isRendererSession(session), true);
  await session.dispose();
});

test("fixture clicks resolve back to the expected presentation-declared entityIds", async () => {
  const session = await mountFreshSession();
  const clicks = await scanClick(session);
  for (const [entityId, expected] of Object.entries(EXPECTED_CLICKABLE)) {
    const click = clicks.get(entityId);
    assert.ok(click, `${entityId} must be clickable`);
    assert.equal(isRendererHit(click.hit), true);
    assert.equal(
      click.hit.presentationId,
      expected.presentationId,
      `${entityId} must resolve via presentation mapping`,
    );
    assert.equal(click.hit.entityId, entityId);
    assert.ok(
      pointInsideAabb(click.hit.point!, expected.aabb),
      `${entityId} hit point ${JSON.stringify(click.hit.point)} must lie inside its world AABB`,
    );
  }
  for (const entityId of EXPECTED_UNCLICKABLE) {
    assert.equal(clicks.has(entityId), false, `${entityId} must never be clickable`);
  }
  const anchor = clicks.get("presentation-survey-anchor");
  assert.ok(anchor, "presentation-only anchor must be clickable by presentationId");
  assert.equal(anchor.hit.entityId, undefined);
  await session.dispose();
});

test("W004 acceptance: repeated fresh mounts resolve the same click to the same entityId", async () => {
  const presentation = buildFixturePresentation();
  const presentationSnapshot = JSON.stringify(presentation);
  const renderer = createBabylonRenderer({
    engineMode: "null",
    headlessViewport: HEADLESS_VIEWPORT,
  });
  let reference: { x: number; y: number } | null = null;
  let referenceEntityId: string | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const session = await renderer.mount(presentation, { container: undefined });
    if (!reference) {
      const clicks = await scanClick(session);
      const column = clicks.get("column-001");
      assert.ok(column, "column-001 must be clickable on first mount");
      reference = { x: column.x, y: column.y };
      referenceEntityId = column.hit.entityId!;
      assert.ok(pointInsideAabb(column.hit.point!, EXPECTED_CLICKABLE["column-001"]!.aabb));
    } else {
      const hit = await session.hitTest({ x: reference.x, y: reference.y });
      assert.equal(
        hit?.entityId,
        referenceEntityId,
        `attempt ${attempt}: same click must resolve to the same entityId`,
      );
      assert.equal(hit?.presentationId, EXPECTED_CLICKABLE["column-001"]!.presentationId);
    }
    await session.dispose();
  }
  assert.equal(
    JSON.stringify(presentation),
    presentationSnapshot,
    "world identity fields must be untouched",
  );
  assert.equal((presentation as { worldId: string }).worldId, "w004-conformance-fixture");
});

test("presentation world identity survives mount/dispose cycles", async () => {
  const presentation = buildFixturePresentation();
  const identityBefore = {
    worldId: presentation.worldId,
    revisionId: presentation.revisionId,
    digest: presentation.digest,
  };
  const renderer = createBabylonRenderer({ engineMode: "null" });
  await renderer.mount(presentation, { container: undefined }).then((session) => session.dispose());
  await renderer.mount(presentation, { container: undefined }).then((session) => session.dispose());
  assert.deepEqual(
    {
      worldId: presentation.worldId,
      revisionId: presentation.revisionId,
      digest: presentation.digest,
    },
    identityBefore,
  );
});

test("navigation changes the view but semantic selection keeps resolving", async () => {
  const session = await mountFreshSession();
  const before = await scanClick(session);
  const columnBefore = before.get("column-001");
  assert.ok(columnBefore);
  session.navigate({ kind: "orbit", deltaYawDeg: 25, deltaPitchDeg: 8 });
  session.navigate({ kind: "zoom", factor: 1.3 });
  session.navigate({ kind: "pan", deltaX: -40, deltaY: 15 });
  const after = await scanClick(session);
  const columnAfter = after.get("column-001");
  assert.ok(columnAfter, "column-001 must stay clickable after navigation");
  assert.equal(columnAfter.hit.entityId, "column-001");
  assert.ok(pointInsideAabb(columnAfter.hit.point!, EXPECTED_CLICKABLE["column-001"]!.aabb));
  // reset：frame（无 entityIds）复位到挂载 home 视角，原点击像素应再次命中。
  session.navigate({ kind: "frame" });
  const hitAtOriginalPixel = await session.hitTest({ x: columnBefore.x, y: columnBefore.y });
  assert.equal(hitAtOriginalPixel?.entityId, "column-001");
  await session.dispose();
});

test("layer visibility gates hit-testing and restores", async () => {
  const session = await mountFreshSession();
  const clicks = await scanClick(session);
  const wall = clicks.get("wall-001");
  assert.ok(wall);
  session.setVisibility({ layerId: "envelope", visible: false });
  assert.equal(await session.hitTest({ x: wall.x, y: wall.y }), null);
  session.setVisibility({ layerId: "envelope", visible: true });
  const restored = await session.hitTest({ x: wall.x, y: wall.y });
  assert.equal(restored?.entityId, "wall-001");
  await session.dispose();
});

test("focus and frame-by-entity are safe and preserve selection semantics", async () => {
  const session = await mountFreshSession();
  session.focus({ entityId: "column-002" });
  const during = await session.hitTest({ x: 400, y: 300 });
  assert.ok(during === null || isRendererHit(during));
  session.navigate({ kind: "frame", entityIds: ["column-002"] });
  const clicks = await scanClick(session);
  const column = clicks.get("column-002");
  assert.ok(column, "focused entity must remain clickable");
  assert.equal(column.hit.entityId, "column-002");
  session.focus({});
  const cleared = await session.hitTest({ x: column.x, y: column.y });
  assert.equal(cleared?.entityId, "column-002");
  await session.dispose();
});

test("resize extension is callable and selection survives it", async () => {
  const session = await mountFreshSession();
  const clicks = await scanClick(session);
  const column = clicks.get("column-001");
  assert.ok(column);
  session.resize();
  session.resize();
  const hit = await session.hitTest({ x: column.x, y: column.y });
  assert.equal(hit?.entityId, "column-001");
  await session.dispose();
});

test("dispose is idempotent and the renderer stays reusable", async () => {
  const renderer = createBabylonRenderer({ engineMode: "null" });
  const presentation = buildFixturePresentation();
  const first = await renderer.mount(presentation, { container: undefined });
  await first.dispose();
  await first.dispose();
  const second = await renderer.mount(presentation, { container: undefined });
  const clicks = await scanClick(second);
  assert.ok(clicks.get("column-001"), "renderer must remain reusable after a dispose");
  await second.dispose();
});

test("sky clicks return null and malformed inputs are rejected", async () => {
  const session = await mountFreshSession();
  assert.equal(await session.hitTest({ x: 1, y: 1 }), null);
  assert.equal(await session.hitTest({ x: HEADLESS_VIEWPORT.width - 1, y: 1 }), null);
  await assert.rejects(() => session.hitTest({ x: Number.NaN, y: 5 } as never), TypeError);
  assert.throws(() => session.navigate({ kind: "warp" } as never), TypeError);
  assert.throws(() => session.setVisibility({ layerId: "x", visible: 1 } as never), TypeError);
  assert.throws(() => session.focus({ entityId: 3 } as never), TypeError);
  await session.dispose();
});
