/**
 * @zcode/epoch-gltf glTF 2.0 JSON schema 健全性测试（hand-rolled validator）。
 *
 * 依据 W010 任务包「Validation tests: parse the produced glTF JSON with a strict
 * validator (e.g. @gltf-transform/core or a hand-rolled schema check — record which)」。
 *
 * 本测试使用 HAND-ROLLED schema check（不引入 @gltf-transform/core 依赖——保持网络无依赖、
 * 零运行时依赖；ARCHITECTURE-LOCK #16/#17）。
 *
 * 检查项：
 * - asset.version === "2.0"，asset.generator 非空。
 * - scenes 是数组，scene=0，scenes[0].nodes 是数组（根节点索引）。
 * - nodes 是数组，每节点有 name + translation[3] + extras.epoch.presentationId。
 * - meshes 是数组，每 mesh.primitives 是数组，每 primitive 有 attributes.POSITION + material + extras.epoch。
 * - materials 是数组，每材质有 name + pbrMetallicRoughness。
 * - buffers 是数组，buffers[0].byteLength === 实际 BIN 字节数。
 * - bufferViews 是数组，每 bufferView 有 buffer=0 + byteOffset + byteLength。
 * - accessors 是数组，每 accessor 有 bufferView + componentType + count + type。
 * - 每个 primitive.attributes.POSITION 指向一个 VEC3 FLOAT accessor，count > 0。
 * - counts：mesh 数 = 有已解析表现的节点数；material 数 = 不同 kind 数。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compilePresentationToGltf } from "../src/index.ts";
import { buildSamplePresentation } from "./presentation-fixture.ts";

interface Accessor {
  bufferView?: number;
  componentType?: number;
  count?: number;
  type?: string;
  min?: number[];
  max?: number[];
}
interface BufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
  target?: number;
}
interface Primitive {
  attributes?: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
  extras?: Record<string, unknown>;
}
interface Mesh {
  primitives?: Primitive[];
}
interface Material {
  name?: string;
  pbrMetallicRoughness?: Record<string, unknown>;
}
interface Node {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  mesh?: number;
  children?: number[];
  extras?: Record<string, unknown>;
}
interface GltfDoc {
  asset?: { version?: string; generator?: string };
  scene?: number;
  scenes?: { nodes?: number[]; extras?: Record<string, unknown> }[];
  nodes?: Node[];
  meshes?: Mesh[];
  materials?: Material[];
  buffers?: { byteLength?: number; uri?: string }[];
  bufferViews?: BufferView[];
  accessors?: Accessor[];
}

const COMPONENT_FLOAT = 5126;

function assertValidGltf(doc: GltfDoc): void {
  assert.ok(doc.asset, "asset required");
  assert.equal(doc.asset.version, "2.0", "asset.version must be 2.0");
  assert.ok(doc.asset.generator, "asset.generator required");
  assert.equal(doc.scene, 0, "scene must be 0");
  assert.ok(Array.isArray(doc.scenes) && doc.scenes.length >= 1, "scenes must be non-empty array");
  assert.ok(Array.isArray(doc.scenes[0]?.nodes), "scenes[0].nodes must be array");
  assert.ok(Array.isArray(doc.nodes), "nodes must be array");
  assert.ok(Array.isArray(doc.meshes), "meshes must be array");
  assert.ok(Array.isArray(doc.materials), "materials must be array");
  assert.ok(
    Array.isArray(doc.buffers) && doc.buffers.length >= 1,
    "buffers must be non-empty array",
  );
  assert.ok(Array.isArray(doc.bufferViews), "bufferViews must be array");
  assert.ok(Array.isArray(doc.accessors), "accessors must be array");
  // 每 bufferView 字段。
  for (const bv of doc.bufferViews ?? []) {
    assert.equal(bv.buffer, 0, "bufferView.buffer must be 0 (single GLB buffer)");
    assert.ok(
      typeof bv.byteOffset === "number" && bv.byteOffset >= 0,
      "bufferView.byteOffset must be non-negative",
    );
    assert.ok(
      typeof bv.byteLength === "number" && bv.byteLength > 0,
      "bufferView.byteLength must be positive",
    );
  }
  // 每 accessor 字段。
  for (const a of doc.accessors ?? []) {
    assert.ok(
      typeof a.bufferView === "number" && a.bufferView >= 0,
      "accessor.bufferView must be index",
    );
    assert.ok(typeof a.componentType === "number", "accessor.componentType required");
    assert.ok(typeof a.count === "number" && a.count > 0, "accessor.count must be positive");
    assert.ok(typeof a.type === "string", "accessor.type required");
  }
  // 每 primitive：必须有 POSITION accessor + material + extras.epoch。
  for (const mesh of doc.meshes ?? []) {
    assert.ok(
      Array.isArray(mesh.primitives) && mesh.primitives.length > 0,
      "mesh must have primitives",
    );
    for (const prim of mesh.primitives ?? []) {
      assert.ok(prim.attributes, "primitive must have attributes");
      const pos = prim.attributes?.POSITION;
      assert.ok(typeof pos === "number", "primitive.attributes.POSITION required");
      const acc = doc.accessors?.[pos];
      assert.ok(acc, "POSITION accessor must exist");
      assert.equal(acc?.type, "VEC3", "POSITION accessor type must be VEC3");
      assert.equal(
        acc?.componentType,
        COMPONENT_FLOAT,
        "POSITION accessor componentType must be FLOAT (5126)",
      );
      assert.ok(typeof prim.material === "number", "primitive.material required");
      const pe = prim.extras?.epoch as
        | { presentationId?: string; representationId?: string }
        | undefined;
      assert.ok(pe, "primitive extras.epoch required");
      assert.ok(pe.presentationId, "primitive extras.epoch.presentationId required");
      assert.ok(pe.representationId, "primitive extras.epoch.representationId required");
    }
  }
  // 每 material 字段。
  for (const m of doc.materials ?? []) {
    assert.ok(m.name, "material.name required");
    assert.ok(m.pbrMetallicRoughness, "material.pbrMetallicRoughness required");
  }
  // 每 node 字段。
  for (const n of doc.nodes ?? []) {
    assert.ok(n.name, "node.name required");
    assert.ok(
      Array.isArray(n.translation) && n.translation.length === 3,
      "node.translation[3] required",
    );
    const ne = n.extras?.epoch as { presentationId?: string } | undefined;
    assert.ok(ne, "node extras.epoch required");
    assert.ok(ne.presentationId, "node extras.epoch.presentationId required");
  }
}

test("validation: compiled glTF 2.0 passes hand-rolled schema check", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const doc = artifact.json as unknown as GltfDoc;
  assertValidGltf(doc);
});

test("validation: mesh/material/node counts match expected fixture", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const doc = artifact.json as unknown as GltfDoc;
  // 3 个节点有已解析表现（root box, child-a triangles, child-b linework）；
  // node-leaf-unsupported 全部 unresolved → 不产生 mesh。
  assert.equal(doc.meshes?.length, 3, "3 meshes (one per node with resolved rep)");
  // 3 种 kind：solid (box), mesh (triangles), linework (line)。
  assert.equal(doc.materials?.length, 3, "3 materials (one per distinct kind)");
  // 4 个节点（输入顺序保留）。
  assert.equal(doc.nodes?.length, 4, "4 nodes (input order preserved, no drops)");
});

test("validation: POSITION accessors have min/max bounds", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const doc = artifact.json as unknown as GltfDoc;
  for (const mesh of doc.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const pos = prim.attributes?.POSITION;
      if (typeof pos !== "number") continue;
      const acc = doc.accessors?.[pos];
      assert.ok(acc?.min, "POSITION accessor must have min");
      assert.ok(acc?.max, "POSITION accessor must have max");
      assert.equal(acc?.min?.length, 3, "POSITION min must be [x,y,z]");
      assert.equal(acc?.max?.length, 3, "POSITION max must be [x,y,z]");
    }
  }
});

test("validation: node hierarchy via children[] matches parentPresentationId", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const doc = artifact.json as unknown as GltfDoc;
  // node-root (index 0) should have children [1, 2] (node-child-a, node-child-b)。
  const root = doc.nodes?.[0];
  assert.deepEqual(root?.children, [1, 2], "node-root children must be [1,2]");
  // node-leaf-unsupported (index 3) should NOT be in node-root.children (no parent).
  assert.ok(!root?.children?.includes(3), "node-leaf-unsupported is a root (no parent)");
});

test("validation: gltf (JSON) format also passes schema check (no glb bytes, data-uri buffer)", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation(), { format: "gltf" });
  assert.equal(artifact.glb, undefined, "gltf format must NOT include glb bytes");
  const doc = artifact.json as unknown as GltfDoc;
  assertValidGltf(doc);
  // gltf format embeds buffer as data-uri.
  assert.ok(
    doc.buffers?.[0]?.uri?.startsWith("data:application/octet-stream;base64,"),
    "gltf buffer must be data-uri",
  );
});
