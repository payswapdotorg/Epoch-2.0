/**
 * epoch-renderer-babylon 几何表现测试：三角形（索引/非索引）与 linework
 * 的场景构建与拾取（box 路径在 session/navigation 测试中覆盖）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createBabylonRenderer } from "../src/index.ts";
import { pointInsideAabb, scanForEntityHits } from "./helpers.ts";

const VIEWPORT = { width: 800, height: 600 };

function presentationWithNodes(nodes: unknown[]) {
  return {
    worldId: "world-geometry",
    revisionId: "rev-001",
    digest: createHash("sha256").update(JSON.stringify(nodes)).digest("hex"),
    projectionMode: "3d",
    nodes,
  };
}

test("indexed triangle meshes mount and resolve clicks to entityId", async () => {
  // 四面体（底面 + 两个侧面），中心在 (0,1,0) 附近。
  const positions = [0, 0, 0, 2, 0, 0, 2, 0, 2, 0, 0, 2, 1, 2.4, 1];
  const indices = [0, 1, 2, 0, 1, 4, 1, 2, 4];
  const nodes = [
    {
      presentationId: "node-tetra",
      entityId: "tetra-001",
      transform: { translation: { x: 0, y: 0, z: 0 } },
      representations: [
        {
          representationId: "rep-tetra",
          kind: "mesh",
          format: "epoch.triangles@1",
          ref: JSON.stringify({ positions, indices }),
        },
      ],
      visibility: "visible",
      interaction: { selectable: true, focusable: true, layerIds: ["structure"] },
    },
  ];
  const renderer = createBabylonRenderer({ engineMode: "null", headlessViewport: VIEWPORT });
  const session = await renderer.mount(presentationWithNodes(nodes), { container: undefined });
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 2);
  const tetra = hits.get("tetra-001");
  assert.ok(tetra, "indexed triangle mesh must be clickable");
  assert.equal(tetra.hit.presentationId, "node-tetra");
  assert.ok(pointInsideAabb(tetra.hit.point!, { min: [0, 0, 0], max: [2, 2.4, 2] }));
  await session.dispose();
});

test("non-indexed triangle soups mount and resolve clicks", async () => {
  const soup = [0, 0, 0, 2, 0, 0, 2, 0, 2, 0, 0, 0, 1, 2.4, 1, 2, 0, 0];
  const nodes = [
    {
      presentationId: "node-soup",
      entityId: "soup-001",
      transform: { translation: { x: 0, y: 0, z: 0 } },
      representations: [
        {
          representationId: "rep-soup",
          kind: "solid",
          format: "epoch.triangles@1",
          ref: JSON.stringify({ positions: soup }),
        },
      ],
      visibility: "visible",
      interaction: { selectable: true, focusable: true, layerIds: ["structure"] },
    },
  ];
  const renderer = createBabylonRenderer({ engineMode: "null", headlessViewport: VIEWPORT });
  const session = await renderer.mount(presentationWithNodes(nodes), { container: undefined });
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 2);
  const soupHit = hits.get("soup-001");
  assert.ok(soupHit, "triangle soup must be clickable");
  assert.ok(pointInsideAabb(soupHit.hit.point!, { min: [0, 0, 0], max: [2, 2.4, 2] }));
  await session.dispose();
});

test("linework representations mount, render and hit-test", async () => {
  const points = [0, 0.1, 0, 3, 0.1, 0, 3, 3.1, 0, 0, 3.1, 0, 0, 0.1, 0];
  const nodes = [
    {
      presentationId: "node-outline",
      entityId: "outline-001",
      transform: { translation: { x: -1.5, y: 0, z: -1 } },
      representations: [
        {
          representationId: "rep-outline",
          kind: "linework",
          format: "epoch.linework@1",
          ref: JSON.stringify({ points }),
        },
      ],
      visibility: "visible",
      interaction: { selectable: true, focusable: true, layerIds: ["annotations"] },
    },
  ];
  const renderer = createBabylonRenderer({ engineMode: "null", headlessViewport: VIEWPORT });
  const session = await renderer.mount(presentationWithNodes(nodes), { container: undefined });
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 2);
  const outline = hits.get("outline-001");
  assert.ok(outline, "linework must be clickable (Babylon line picking)");
  assert.equal(outline.hit.entityId, "outline-001");
  await session.dispose();
});

test("unsupported formats mount without geometry and stay out of picking", async () => {
  const nodes = [
    {
      presentationId: "node-gltf",
      entityId: "gltf-001",
      transform: { translation: { x: 0, y: 1, z: 0 } },
      representations: [
        {
          representationId: "rep-gltf",
          kind: "generated-proxy",
          format: "gltf@2.0",
          ref: JSON.stringify({ uri: "ignored.glb" }),
        },
      ],
      visibility: "visible",
      interaction: { selectable: true, focusable: true, layerIds: ["structure"] },
    },
  ];
  const renderer = createBabylonRenderer({ engineMode: "null", headlessViewport: VIEWPORT });
  const session = await renderer.mount(presentationWithNodes(nodes), { container: undefined });
  // 空场景（无几何）：全视口扫描无命中，但挂载/释放正常。
  const hits = await scanForEntityHits((input) => session.hitTest(input), VIEWPORT, 8);
  assert.equal(hits.size, 0);
  await session.dispose();
});
