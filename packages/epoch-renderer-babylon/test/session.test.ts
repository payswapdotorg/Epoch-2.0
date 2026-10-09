/**
 * epoch-renderer-babylon 会话行为测试（NullEngine：真实适配器代码路径，
 * CPU 拾取为真实射线-网格求交；无 WebGL 帧输出）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBabylonRenderer } from "../src/index.ts";
import { isRendererHit } from "../src/index.ts";
import type { BabylonRendererSession } from "../src/session.ts";
import { getBabylonSessionInternals } from "../src/session.ts";
import {
  buildTestPresentation,
  pointInsideAabb,
  scanForEntityHits,
  type TestNodeSpec,
} from "./helpers.ts";

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
    presentationId: "node-column-b",
    entityId: "column-002",
    translation: { x: -3, y: 1.5, z: 2 },
    box: { sizeX: 0.4, sizeY: 3, sizeZ: 0.4 },
    layerIds: ["structure"],
  },
  {
    presentationId: "node-frame",
    entityId: "frame-001",
    translation: { x: 3, y: 0, z: -2 },
    layerIds: ["structure"],
  },
  {
    presentationId: "node-frame-post",
    entityId: "post-009",
    parentPresentationId: "node-frame",
    translation: { x: 0, y: 1.5, z: 0 },
    box: { sizeX: 0.35, sizeY: 3, sizeZ: 0.35 },
    layerIds: ["structure"],
  },
  {
    presentationId: "node-wall",
    entityId: "wall-001",
    translation: { x: 0, y: 1.5, z: -3 },
    box: { sizeX: 8, sizeY: 3, sizeZ: 0.2 },
    layerIds: ["envelope", "structure"],
  },
  {
    presentationId: "node-survey-marker",
    translation: { x: 5.5, y: 0.2, z: 4.5 },
    box: { sizeX: 0.3, sizeY: 0.3, sizeZ: 0.3 },
    layerIds: ["site"],
  },
  {
    presentationId: "node-ghost",
    entityId: "ghost-001",
    translation: { x: 0, y: 0.2, z: 0 },
    box: { sizeX: 1, sizeY: 0.4, sizeZ: 1 },
    layerIds: ["site"],
    visibility: "hidden",
  },
];

function makeRenderer() {
  return createBabylonRenderer({ engineMode: "null", headlessViewport: VIEWPORT });
}

async function mountSession(
  portableState?: Record<string, unknown>,
): Promise<{ session: BabylonRendererSession }> {
  const renderer = makeRenderer();
  const presentation = buildTestPresentation("world-session", SPECS);
  const session = (await renderer.mount(presentation, {
    container: undefined,
    ...(portableState ? { portableState } : {}),
  })) as BabylonRendererSession;
  return { session };
}

test("mount builds the mapping registry and resolves hits to entityId", async () => {
  const { session } = await mountSession();
  const internals = getBabylonSessionInternals(session);
  assert.ok(internals);
  assert.equal(internals.mapping.byPresentationId.size, SPECS.length);
  assert.deepEqual(internals.mapping.presentationIdsByEntityId.get("column-001"), [
    "node-column-a",
  ]);
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT);
  assert.equal(hits.has("ground-001"), false, "non-selectable ground must never be hit");
  assert.equal(hits.has("ghost-001"), false, "hidden node must never be hit");
  const column = hits.get("column-001");
  assert.ok(column, "column-001 must be clickable");
  assert.equal(column.hit.presentationId, "node-column-a");
  assert.equal(column.hit.entityId, "column-001");
  assert.ok(pointInsideAabb(column.hit.point!, { min: [2.8, 0, 1.8], max: [3.2, 3, 2.2] }));
  assert.equal(isRendererHit(column.hit), true);
  await session.dispose();
});

test("survey marker without entityId hits with presentationId only", async () => {
  const { session } = await mountSession();
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 2);
  const marker = hits.get("node-survey-marker");
  assert.ok(marker, "presentation-only node must still be discoverable by scan");
  assert.equal(marker.hit.presentationId, "node-survey-marker");
  assert.equal(marker.hit.entityId, undefined);
  assert.equal(isRendererHit(marker.hit), true);
  await session.dispose();
});

test("hierarchy: child hit resolves to the child's own identity with composed transform", async () => {
  const { session } = await mountSession();
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 2);
  const post = hits.get("post-009");
  assert.ok(post, "child node must be clickable");
  assert.equal(post.hit.presentationId, "node-frame-post");
  // 世界位置 = 父(3,0,-2) + 子(0,1.5,0) = (3,1.5,-2)，AABB 含该命中点。
  assert.ok(pointInsideAabb(post.hit.point!, { min: [2.82, 0, -2.18], max: [3.18, 3, -1.82] }));
  await session.dispose();
});

test("repeated fresh mounts resolve the same click to the same entityId", async () => {
  const renderer = makeRenderer();
  const presentation = buildTestPresentation("world-session", SPECS);
  const snapshot = JSON.stringify(presentation);
  let reference: { x: number; y: number; entityId: string; presentationId: string } | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const session = await renderer.mount(presentation, { container: undefined });
    const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 4);
    const column = hits.get("column-001");
    assert.ok(column, `attempt ${attempt}: column-001 must be clickable`);
    if (!reference) {
      reference = {
        x: column.x,
        y: column.y,
        entityId: column.hit.entityId!,
        presentationId: column.hit.presentationId,
      };
    } else {
      const hit = await session.hitTest({ x: reference.x, y: reference.y });
      assert.equal(
        hit?.entityId,
        reference.entityId,
        `attempt ${attempt}: same pixel must hit same entity`,
      );
      assert.equal(hit?.presentationId, reference.presentationId);
    }
    await session.dispose();
  }
  assert.equal(JSON.stringify(presentation), snapshot, "presentation source must remain unmutated");
});

test("concurrent sessions of the same presentation resolve identically", async () => {
  const renderer = makeRenderer();
  const presentation = buildTestPresentation("world-session", SPECS);
  const sessions = await Promise.all([
    renderer.mount(presentation, { container: undefined }),
    renderer.mount(presentation, { container: undefined }),
  ]);
  const hits = await Promise.all(
    sessions.map((session) => scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 4)),
  );
  for (const found of hits) {
    const column = found.get("column-001");
    assert.ok(column);
    assert.equal(column.hit.entityId, "column-001");
  }
  await Promise.all(sessions.map((session) => session.dispose()));
});

test("mapping law: node order does not affect click-to-identity resolution", async () => {
  // 同一表现、节点数组倒序：mesh 索引/名字全部改变，但世界几何与身份不变。
  // 若身份取自 mesh 名/序，两次解析必然分歧。
  const renderer = makeRenderer();
  const forward = buildTestPresentation("world-order", SPECS);
  const reversed = buildTestPresentation("world-order", [...SPECS].reverse());
  const forwardSession = await renderer.mount(forward, { container: undefined });
  const reversedSession = await renderer.mount(reversed, { container: undefined });
  const forwardHits = await scanForEntityHits(
    (input) => forwardSession.hitTest(input),
    VIEWPORT,
    4,
  );
  const reversedHits = await scanForEntityHits(
    (input) => reversedSession.hitTest(input),
    VIEWPORT,
    4,
  );
  const forwardColumn = forwardHits.get("column-001");
  const reversedColumn = reversedHits.get("column-001");
  assert.ok(forwardColumn && reversedColumn);
  assert.deepEqual(
    {
      presentationId: reversedColumn.hit.presentationId,
      entityId: reversedColumn.hit.entityId,
    },
    {
      presentationId: forwardColumn.hit.presentationId,
      entityId: forwardColumn.hit.entityId,
    },
  );
  const samePixel = await reversedSession.hitTest({ x: forwardColumn.x, y: forwardColumn.y });
  assert.equal(samePixel?.entityId, "column-001");
  assert.equal(samePixel?.presentationId, "node-column-a");
  await forwardSession.dispose();
  await reversedSession.dispose();
});

test("hitTest: sky miss returns null; invalid input rejects; post-dispose returns null", async () => {
  const { session } = await mountSession();
  const sky = await session.hitTest({ x: 2, y: 2 });
  assert.equal(sky, null);
  await assert.rejects(() => session.hitTest({ x: Number.NaN, y: 3 } as never), TypeError);
  await session.dispose();
  assert.equal(await session.hitTest({ x: 400, y: 300 }), null);
});

test("invalid navigate/setVisibility/focus inputs throw TypeError", async () => {
  const { session } = await mountSession();
  assert.throws(() => session.navigate({ kind: "teleport" } as never), TypeError);
  assert.throws(() => session.setVisibility({ layerId: "", visible: true } as never), TypeError);
  assert.throws(() => session.focus({ entityId: 7 } as never), TypeError);
  await session.dispose();
});

test("layer visibility: hiding any member layer hides the node and its hits", async () => {
  const { session } = await mountSession();
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 4);
  const wallPixel = hits.get("wall-001");
  assert.ok(wallPixel);
  // wall 同时属于 envelope + structure：任一隐藏即隐藏（AND 语义）。
  session.setVisibility({ layerId: "envelope", visible: false });
  assert.equal(await session.hitTest({ x: wallPixel.x, y: wallPixel.y }), null);
  session.setVisibility({ layerId: "envelope", visible: true });
  assert.equal((await session.hitTest({ x: wallPixel.x, y: wallPixel.y }))?.entityId, "wall-001");
  session.setVisibility({ layerId: "structure", visible: false });
  assert.equal(await session.hitTest({ x: wallPixel.x, y: wallPixel.y }), null);
  // structure 隐藏也隐藏柱（单独成员）。
  const columnPixel = hits.get("column-001");
  assert.ok(columnPixel);
  assert.equal(await session.hitTest({ x: columnPixel.x, y: columnPixel.y }), null);
  session.setVisibility({ layerId: "structure", visible: true });
  assert.equal(
    (await session.hitTest({ x: columnPixel.x, y: columnPixel.y }))?.entityId,
    "column-001",
  );
  await session.dispose();
});

test("focus highlights entity meshes and restores on clear", async () => {
  const { session } = await mountSession();
  const internals = getBabylonSessionInternals(session)!;
  const record = internals.mapping.byPresentationId.get("node-column-a");
  assert.ok(record);
  const mesh = record.meshes[0]!;
  const material = mesh.material as { emissiveColor: { r: number; g: number; b: number } };
  const before = { ...material.emissiveColor };
  session.focus({ entityId: "column-001" });
  assert.notDeepEqual(
    { ...material.emissiveColor },
    before,
    "focus must change emissive highlight",
  );
  session.focus({});
  assert.deepEqual({ ...material.emissiveColor }, before, "clear focus must restore emissive");
  await session.dispose();
});

test("focus: entityId wins when both ids are provided", async () => {
  const { session } = await mountSession();
  const internals = getBabylonSessionInternals(session)!;
  const columnMesh = internals.mapping.byPresentationId.get("node-column-a")!.meshes[0]!;
  const wallMesh = internals.mapping.byPresentationId.get("node-wall")!.meshes[0]!;
  const columnMaterial = columnMesh.material as {
    emissiveColor: { r: number; g: number; b: number };
  };
  const wallMaterial = wallMesh.material as { emissiveColor: { r: number; g: number; b: number } };
  const columnBaseline = { ...columnMaterial.emissiveColor };
  const wallBaseline = { ...wallMaterial.emissiveColor };
  session.focus({ entityId: "column-001", presentationId: "node-wall" });
  assert.notDeepEqual(
    { ...columnMaterial.emissiveColor },
    columnBaseline,
    "entityId target must be highlighted",
  );
  assert.deepEqual(
    { ...wallMaterial.emissiveColor },
    wallBaseline,
    "presentationId loser must stay unhighlighted",
  );
  await session.dispose();
});

test("mount rejects invalid presentation/options and cross-world portable state", async () => {
  const renderer = makeRenderer();
  await assert.rejects(
    () => renderer.mount({ nope: true } as never, { container: undefined }),
    TypeError,
  );
  await assert.rejects(
    () => renderer.mount(buildTestPresentation("world-session", SPECS), {} as never),
    TypeError,
  );
  await assert.rejects(
    () =>
      renderer.mount(buildTestPresentation("world-session", SPECS), {
        container: undefined,
        portableState: { worldId: "other-world", digest: "abc" },
      }),
    TypeError,
  );
});

test("portable state restores hidden layers and focus at mount", async () => {
  const presentation = buildTestPresentation("world-session", SPECS);
  const renderer = makeRenderer();
  const session = (await renderer.mount(presentation, {
    container: undefined,
    portableState: {
      worldId: "world-session",
      digest: "different-digest-same-world-revision-best-effort",
      hiddenLayerIds: ["envelope"],
      focusedEntityId: "column-001",
    },
  })) as BabylonRendererSession;
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 4);
  assert.equal(hits.has("wall-001"), false, "hidden layer from portable state must stay hidden");
  assert.ok(hits.has("column-001"), "non-hidden entity stays clickable");
  const internals = getBabylonSessionInternals(session)!;
  const mesh = internals.mapping.byPresentationId.get("node-column-a")!.meshes[0]!;
  const material = mesh.material as { emissiveColor: { r: number; g: number; b: number } };
  assert.deepEqual(
    { ...material.emissiveColor },
    { r: 1, g: 0.6235294117647059, b: 0.1803921568627451 },
    "portable focusedEntityId must restore highlight (accent #ff9f2e)",
  );
  await session.dispose();
});

test("dispose is idempotent and post-dispose navigation is a safe no-op", async () => {
  const { session } = await mountSession();
  await session.dispose();
  await session.dispose();
  session.navigate({ kind: "orbit", deltaYawDeg: 10 });
  session.setVisibility({ layerId: "site", visible: false });
  session.focus({ entityId: "column-001" });
  session.resize();
  assert.equal(await session.hitTest({ x: 400, y: 300 }), null);
});

test("resize extension: callable, idempotent, keeps engine dimensions under NullEngine", async () => {
  const { session } = await mountSession();
  const internals = getBabylonSessionInternals(session)!;
  const width = internals.engine.getRenderWidth();
  session.resize();
  session.resize();
  assert.equal(internals.engine.getRenderWidth(), width);
  await session.dispose();
});
