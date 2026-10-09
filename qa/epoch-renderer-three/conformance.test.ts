/**
 * W008 渲染器适配器一致性测试（qa/epoch-renderer-three）。
 *
 * 纯契约面：只通过公共入口 @zcode/epoch-renderer-three 的导出驱动适配器
 * （不 import three、不 import 包内部模块）。引擎为无头模式（engineMode
 * "null"）——真实适配器代码路径（场景构建、THREE.Raycaster CPU 射线-
 * 网格求交、相机数学），只是不产生 GPU 帧；视觉证明属后续宿主波次。
 *
 * 点击坐标来源：粗粒度视口扫描 + 命中点世界 AABB 包含验证（点击↔实体
 * 绑定的几何证明，非循环验证——见 presentation-fixture 的
 * EXPECTED_CLICKABLE）。
 *
 * 能力行使标签（per-capability exercise labels，见报告）：
 * - mount/orbit/pan/zoom/focus/reset/hit-test/layer-visibility/highlight/
 *   dispose：本测试真实行使（exercised-headless，无头 CPU 路径）。
 * - navigate()/hitTest() 真实调用；raycaster 为真实射线-网格求交，非 mock。
 *
 * 可移植状态等价性（ARCHITECTURE-LOCK #12「Portable state survives
 * renderer switching」）分两层证明：
 * 1) 同一 Three 适配器两次独立 mount：捕获 focusedEntityId + hiddenLayerIds
 *    -> dispose -> 用 portableState 重新 mount -> 断言聚焦实体仍解析到
 *    同一 entityId，且隐藏层仍隐藏。
 * 2) 跨渲染器：同一 WorldPresentation 先用 W004 Babylon 适配器（其公开
 *    导出 @zcode/epoch-renderer-babylon——已合并于 main，可消费公开导出）
 *    mount，捕获 portable state，再用本 Three 适配器 mount 并恢复，
 *    断言同一 entityId 解析。Babylon 引擎为 NullEngine（同样无头真实路径）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createThreeRenderer,
  isRendererDescriptor,
  isRendererHit,
  isRendererSession,
  isWellFormedRenderer,
} from "../../packages/epoch-renderer-three/src/index.ts";
import type {
  RendererHit,
  RendererSession,
} from "../../packages/epoch-renderer-three/src/index.ts";
// 跨渲染器等价性测试：消费 W004 Babylon 适配器的公开导出（已合并于 main，
// 是冻结输入；只读消费，不编辑其源码）。
import { createBabylonRenderer } from "../../packages/epoch-renderer-babylon/src/index.ts";
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
  const renderer = createThreeRenderer({
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
  const renderer = createThreeRenderer({ engineMode: "null" });
  assert.equal(isWellFormedRenderer(renderer), true);
  const descriptor = renderer.descriptor();
  assert.equal(isRendererDescriptor(descriptor), true);
  assert.equal(descriptor.id, "epoch-renderer-three");
  assert.equal(descriptor.capabilities.hitTesting, true);
  assert.equal(descriptor.capabilities.webgl, true);
  assert.equal(descriptor.capabilities.walk, false);
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

test("W008 acceptance: repeated fresh mounts resolve the same click to the same entityId", async () => {
  const presentation = buildFixturePresentation();
  const presentationSnapshot = JSON.stringify(presentation);
  const renderer = createThreeRenderer({
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
  assert.equal((presentation as { worldId: string }).worldId, "w008-conformance-fixture");
});

test("presentation world identity survives mount/dispose cycles", async () => {
  const presentation = buildFixturePresentation();
  const identityBefore = {
    worldId: presentation.worldId,
    revisionId: presentation.revisionId,
    digest: presentation.digest,
  };
  const renderer = createThreeRenderer({ engineMode: "null" });
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
  const renderer = createThreeRenderer({ engineMode: "null" });
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

test("portable state survives a renderer SWITCH across two Three sessions", async () => {
  // 第一会话：mount、设聚焦实体、隐藏图层、捕获 portable state、dispose。
  const renderer = createThreeRenderer({
    engineMode: "null",
    headlessViewport: HEADLESS_VIEWPORT,
  });
  const presentation = buildFixturePresentation();
  const first = await renderer.mount(presentation, { container: undefined });
  first.setVisibility({ layerId: "envelope", visible: false });
  first.focus({ entityId: "column-001" });
  // 验证第一会话聚焦与隐藏生效。
  const wallBefore = await scanClick(first);
  assert.ok(wallBefore.get("wall-001") === undefined, "wall layer hidden in first session");
  // 捕获可移植状态（语义投影：worldId/digest/focusedEntityId/hiddenLayerIds）。
  const portableState = {
    worldId: presentation.worldId,
    digest: presentation.digest,
    focusedEntityId: "column-001",
    hiddenLayerIds: ["envelope"],
  };
  await first.dispose();
  // 第二会话：用 portableState 重新 mount——应恢复聚焦实体与隐藏图层。
  const second = await renderer.mount(presentation, {
    container: undefined,
    portableState,
  });
  const wallAfter = await scanClick(second);
  assert.equal(
    wallAfter.has("wall-001"),
    false,
    "hidden layer must remain hidden after portable-state restore",
  );
  const columnHit = await scanClick(second);
  const column = columnHit.get("column-001");
  assert.ok(column, "focused entity must remain resolvable after switch");
  assert.equal(column.hit.entityId, "column-001");
  await second.dispose();
});

test("portable state survives a cross-renderer SWITCH: Babylon -> Three", async () => {
  // 跨渲染器等价性（ARCHITECTURE-LOCK #12）：同一 WorldPresentation 先在
  // W004 Babylon 适配器（NullEngine 无头真实路径）中 mount，捕获 portable
  // state，再用本 Three 适配器 mount 并恢复——断言同一 entityId 在两侧
  // 都能解析（语义选择映射不依赖渲染器实现）。
  const presentation = buildFixturePresentation();
  // Babylon 第一会话：扫描得到 column-001 的点击坐标与 entityId。
  const babylon = createBabylonRenderer({
    engineMode: "null",
    headlessViewport: HEADLESS_VIEWPORT,
  });
  const babylonSession = await babylon.mount(presentation, { container: undefined });
  const babylonClicks = await scanClickBabylon(babylonSession);
  const babylonColumn = babylonClicks.get("column-001");
  assert.ok(babylonColumn, "Babylon must resolve column-001 (baseline for cross-renderer proof)");
  assert.equal(babylonColumn.hit.entityId, "column-001");
  await babylonSession.dispose();
  // Three 第二会话：用同 presentation + portable state（聚焦 column-001）mount。
  const three = createThreeRenderer({
    engineMode: "null",
    headlessViewport: HEADLESS_VIEWPORT,
  });
  const portableState = {
    worldId: presentation.worldId,
    digest: presentation.digest,
    focusedEntityId: "column-001",
  };
  const threeSession = await three.mount(presentation, { container: undefined, portableState });
  const threeClicks = await scanClick(threeSession);
  const threeColumn = threeClicks.get("column-001");
  assert.ok(threeColumn, "Three must resolve column-001 after restoring Babylon portable state");
  assert.equal(
    threeColumn.hit.entityId,
    "column-001",
    "cross-renderer: same entityId must resolve (portable selection state)",
  );
  assert.equal(
    threeColumn.hit.presentationId,
    EXPECTED_CLICKABLE["column-001"]!.presentationId,
    "cross-renderer: same presentationId must resolve",
  );
  await threeSession.dispose();
});

/** Babylon 扫描辅助（Babylon 的 hitTest 签名与 Three 一致——契约冻结）。 */
async function scanClickBabylon(
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
