/**
 * epoch-renderer-babylon 表现解析织构测试：内建格式接受/拒绝。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BABYLON_BUILTIN_REPRESENTATION_FORMATS,
  resolveRepresentation,
} from "../src/representation-fabric.ts";

function ref(format: string, payload: unknown) {
  return {
    representationId: "rep-001",
    kind: "mesh",
    format,
    ref: typeof payload === "string" ? payload : JSON.stringify(payload),
  };
}

test("epoch.box@1 accepts full size payloads", () => {
  assert.deepEqual(resolveRepresentation(ref("epoch.box@1", { sizeX: 1, sizeY: 2, sizeZ: 3 })), {
    kind: "box",
    sizeX: 1,
    sizeY: 2,
    sizeZ: 3,
  });
});

test("epoch.box@1 rejects malformed payloads", () => {
  assert.equal(resolveRepresentation(ref("epoch.box@1", { sizeX: 1 })).kind, "unsupported");
  assert.equal(
    resolveRepresentation(ref("epoch.box@1", { sizeX: "a", sizeY: 1, sizeZ: 1 })).kind,
    "unsupported",
  );
  assert.equal(resolveRepresentation(ref("epoch.box@1", "not json")).kind, "unsupported");
  assert.equal(resolveRepresentation(ref("epoch.box@1", [1, 2, 3])).kind, "unsupported");
});

test("epoch.triangles@1 accepts positions with optional indices", () => {
  const resolved = resolveRepresentation(
    ref("epoch.triangles@1", { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }),
  );
  assert.equal(resolved.kind, "triangles");
  assert.deepEqual(
    resolved.kind === "triangles" ? resolved.positions : null,
    [0, 0, 0, 1, 0, 0, 0, 1, 0],
  );
  assert.deepEqual(resolved.kind === "triangles" ? resolved.indices : null, [0, 1, 2]);
  const nonIndexed = resolveRepresentation(
    ref("epoch.triangles@1", { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] }),
  );
  assert.equal(nonIndexed.kind, "triangles");
});

test("epoch.triangles@1 rejects bad payloads", () => {
  assert.equal(
    resolveRepresentation(ref("epoch.triangles@1", { positions: [0, 0] })).kind,
    "unsupported",
  );
  assert.equal(
    resolveRepresentation(ref("epoch.triangles@1", { positions: [0, 0, "x"] })).kind,
    "unsupported",
  );
  assert.equal(
    resolveRepresentation(ref("epoch.triangles@1", { positions: [0, 0, 0], indices: [0] })).kind,
    "unsupported",
  );
  assert.equal(resolveRepresentation(ref("epoch.triangles@1", "")).kind, "unsupported");
  // 非索引三角形汤必须由完整三角形（9 数 = 3 顶点）组成。
  assert.equal(
    resolveRepresentation(ref("epoch.triangles@1", { positions: [0, 0, 0, 1, 0, 0] })).kind,
    "unsupported",
  );
});

test("epoch.linework@1 accepts xyz triples", () => {
  const resolved = resolveRepresentation(ref("epoch.linework@1", { points: [0, 0, 0, 1, 1, 1] }));
  assert.equal(resolved.kind, "linework");
  assert.deepEqual(resolved.kind === "linework" ? resolved.points : null, [0, 0, 0, 1, 1, 1]);
  assert.equal(
    resolveRepresentation(ref("epoch.linework@1", { points: [0, 0] })).kind,
    "unsupported",
  );
});

test("unknown formats resolve to unsupported without guessing", () => {
  const resolved = resolveRepresentation(ref("gltf@2.0", { uri: "x.glb" }));
  assert.deepEqual(resolved, { kind: "unsupported", format: "gltf@2.0" });
  assert.deepEqual(BABYLON_BUILTIN_REPRESENTATION_FORMATS, [
    "epoch.box@1",
    "epoch.triangles@1",
    "epoch.linework@1",
  ]);
});
