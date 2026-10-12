import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  FORMAT_MATRIX,
  getFormatDescriptor,
  importFormatDescriptor,
  listFormatIds,
} from "../src/build/formats.js";

const NO_FEATURES = {
  meshes: true,
  materials: false,
  skeletons: false,
  animations: false,
  pbr: false,
};

const KNOWN_IDS = ["3ds", "dae", "fbx", "glb", "gltf2", "obj", "off", "ply", "stl", "x"];

test("listFormatIds returns the sorted documented surface", () => {
  const ids = listFormatIds();
  assert.deepEqual(ids, [...ids].sort());
  assert.deepEqual(ids, KNOWN_IDS);
});

test("gltf2 is documented as full-fidelity with every feature", () => {
  const gltf2 = getFormatDescriptor("gltf2");
  assert.notEqual(gltf2, null);
  assert.equal(gltf2?.fidelityClass, "full-fidelity");
  assert.deepEqual(gltf2?.features, {
    meshes: true,
    materials: true,
    skeletons: true,
    animations: true,
    pbr: true,
  });
  assert.ok(gltf2?.extensions.includes(".gltf"));
});

test("getFormatDescriptor returns null for unknown format ids", () => {
  assert.equal(getFormatDescriptor("bogus"), null);
  assert.equal(getFormatDescriptor(""), null);
});

test("every matrix descriptor is well-formed", () => {
  for (const descriptor of Object.values(FORMAT_MATRIX)) {
    assert.match(descriptor.formatId, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(descriptor.displayName.length > 0);
    assert.ok(descriptor.notes.length > 0);
    assert.ok(descriptor.extensions.length > 0);
    for (const extension of descriptor.extensions) {
      assert.match(extension, /^\.[a-z0-9]+$/);
    }
    assert.ok(
      ["full-fidelity", "meshes-materials", "meshes-only"].includes(descriptor.fidelityClass),
    );
  }
});

test("fbx documents skeletons, animations and PBR", () => {
  const fbx = getFormatDescriptor("fbx");
  assert.equal(fbx?.features.skeletons, true);
  assert.equal(fbx?.features.animations, true);
  assert.equal(fbx?.features.pbr, true);
  assert.equal(fbx?.fidelityClass, "full-fidelity");
});

test("stl is meshes-only", () => {
  const stl = getFormatDescriptor("stl");
  assert.equal(stl?.features.meshes, true);
  assert.equal(stl?.features.materials, false);
  assert.equal(stl?.fidelityClass, "meshes-only");
});

test("obj carries meshes and materials but no animations", () => {
  const obj = getFormatDescriptor("obj");
  assert.equal(obj?.features.meshes, true);
  assert.equal(obj?.features.materials, true);
  assert.equal(obj?.features.animations, false);
  assert.equal(obj?.fidelityClass, "meshes-materials");
});

test("importFormatDescriptor builds a validated descriptor", () => {
  const descriptor = importFormatDescriptor({
    formatId: "custom-format",
    displayName: "Custom Format",
    extensions: [".cst", ".cstm"],
    features: NO_FEATURES,
    fidelityClass: "meshes-only",
    notes: "A hypothetical host-registered format.",
  });
  assert.equal(descriptor.formatId, "custom-format");
  assert.deepEqual(descriptor.extensions, [".cst", ".cstm"]);
  assert.equal(descriptor.fidelityClass, "meshes-only");
});

test("importFormatDescriptor rejects non-kebab format ids", () => {
  assert.throws(
    () =>
      importFormatDescriptor({
        formatId: "Bad_Id",
        displayName: "x",
        extensions: [".x"],
        features: NO_FEATURES,
        fidelityClass: "meshes-only",
        notes: "n",
      }),
    /kebab/,
  );
});

test("importFormatDescriptor rejects malformed extensions", () => {
  assert.throws(
    () =>
      importFormatDescriptor({
        formatId: "ok-id",
        displayName: "x",
        extensions: ["obj"],
        features: NO_FEATURES,
        fidelityClass: "meshes-only",
        notes: "n",
      }),
    /extension/,
  );
});

test("importFormatDescriptor rejects unknown fidelity classes", () => {
  assert.throws(
    () =>
      importFormatDescriptor({
        formatId: "ok-id",
        displayName: "x",
        extensions: [".x"],
        features: NO_FEATURES,
        fidelityClass: "magic",
        notes: "n",
      }),
    /fidelity class/,
  );
});
