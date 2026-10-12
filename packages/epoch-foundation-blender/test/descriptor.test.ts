import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  BLENDER_LICENSE_ID,
  BLENDER_TOOL_ID,
  FREECAD_LICENSE_ID,
  FREECAD_TOOL_ID,
  buildBlenderToolDescriptor,
  buildFreecadToolDescriptor,
  descriptorDigest,
} from "../src/index.js";

const blender = buildBlenderToolDescriptor({ toolVersion: "4.2.0" });
const freecad = buildFreecadToolDescriptor({ toolVersion: "1.0.0" });

test("blender descriptor pins identity, version, process kind, and license", () => {
  assert.equal(blender.toolId, BLENDER_TOOL_ID);
  assert.equal(blender.toolId, "blender-bpy-headless");
  assert.equal(blender.toolName, "Blender");
  assert.equal(blender.toolVersion, "4.2.0");
  assert.equal(blender.processKind, "bpy-headless");
  assert.equal(blender.licenseId, BLENDER_LICENSE_ID);
  assert.equal(blender.descriptorRevision, 1);
  assert.equal(blender.argv.binaryName, "blender");
  assert.deepEqual(blender.argv.headlessFlags, ["--background", "--factory-startup"]);
  assert.equal(blender.argv.scriptFlag, "--python");
  assert.equal(blender.argv.scriptArgumentStyle, "flag-value");
  assert.equal(blender.argv.requiresPythonExitCodeFlag, true);
  assert.deepEqual(blender.argv.versionProbeArgv, ["--version"]);
});

test("blender format support is sorted and mesh-honest", () => {
  const ids = blender.formats.map((support) => support.formatId);
  assert.deepEqual([...ids].sort(), [...ids]);
  assert.ok(ids.includes("obj"));
  assert.ok(ids.includes("stl"));
  assert.ok(ids.includes("gltf"));
  const stl = blender.formats.find((support) => support.formatId === "stl");
  assert.ok(stl !== undefined && stl.direction === "both");
  const addonOnly = blender.formats
    .filter((support) => support.requiresAddon)
    .map((support) => support.formatId);
  assert.deepEqual(addonOnly, ["3mf"]);
});

test("freecad descriptor covers BRep formats with a console argv shape", () => {
  assert.equal(freecad.toolId, FREECAD_TOOL_ID);
  assert.equal(freecad.toolId, "freecad-console");
  assert.equal(freecad.processKind, "console-mode");
  assert.equal(freecad.licenseId, FREECAD_LICENSE_ID);
  assert.equal(freecad.argv.binaryName, "FreeCADCmd");
  assert.equal(freecad.argv.scriptArgumentStyle, "positional");
  assert.equal(freecad.argv.scriptFlag, null);
  assert.equal(freecad.argv.requiresPythonExitCodeFlag, false);
  const ids = freecad.formats.map((support) => support.formatId);
  assert.deepEqual([...ids].sort(), [...ids]);
  assert.ok(ids.includes("step"));
  assert.ok(ids.includes("brep"));
  assert.ok(ids.includes("iges"));
  assert.ok(!ids.includes("blend"));
});

test("exit-code contracts state honesty notes", () => {
  assert.equal(blender.exitCodes.successCode, 0);
  assert.equal(freecad.exitCodes.successCode, 0);
  assert.ok(freecad.exitCodes.honestyNotes.join(" ").includes("exit 0"));
  assert.ok(blender.exitCodes.honestyNotes.join(" ").includes("--python-exit-code"));
  assert.ok(blender.exitCodes.unmappedCodeMeaning.length > 0);
});

test("descriptor digests are stable and version-sensitive", () => {
  assert.equal(descriptorDigest(blender), descriptorDigest(blender));
  assert.match(descriptorDigest(blender), /^[0-9a-f]{64}$/);
  const other = buildBlenderToolDescriptor({ toolVersion: "4.3.0" });
  assert.notEqual(descriptorDigest(blender), descriptorDigest(other));
  const revised = buildBlenderToolDescriptor({ toolVersion: "4.2.0", descriptorRevision: 2 });
  assert.notEqual(descriptorDigest(blender), descriptorDigest(revised));
});

test("descriptor builders reject malformed inputs", () => {
  assert.throws(() => buildBlenderToolDescriptor({ toolVersion: "4.2" }));
  assert.throws(() => buildFreecadToolDescriptor({ toolVersion: "not-a-version" }));
  assert.throws(() => buildBlenderToolDescriptor({ toolVersion: "4.2.0", descriptorRevision: 0 }));
  assert.throws(() => buildFreecadToolDescriptor({ toolVersion: "1.0.0", descriptorRevision: -1 }));
});
