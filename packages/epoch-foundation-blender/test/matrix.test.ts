import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildBlenderLicenseRecord,
  buildBlenderToolDescriptor,
  buildFreecadLicenseRecord,
  buildFreecadToolDescriptor,
  presetBlenderObjExport,
  presetFreecadStepExport,
  summarizeCapabilityMatrix,
  toDigest,
  toKebabId,
  toNonEmptyString,
} from "../src/index.js";
import type { SemanticAuthorityKind, SemanticAuthorityRef } from "../src/index.js";

const blender = buildBlenderToolDescriptor({ toolVersion: "4.2.0" });
const freecad = buildFreecadToolDescriptor({ toolVersion: "1.0.0" });
const blenderLicense = buildBlenderLicenseRecord({ toolVersion: "4.2.0" });
const freecadLicense = buildFreecadLicenseRecord({ toolVersion: "1.0.0" });

function authorityRef(authorityKind: SemanticAuthorityKind): SemanticAuthorityRef {
  return {
    authorityKind,
    authorityId: toKebabId("epoch-occt-geometry"),
    authorityPackage: toNonEmptyString("@zcode/epoch-foundation-occt"),
    workOrderRef: toNonEmptyString("W011"),
    recordDigest: toDigest("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
    relationship: toNonEmptyString("owns the geometry semantics for the exchanged data"),
  };
}

const objExport = presetBlenderObjExport(blender, [authorityRef("world-model")]);
const stepExport = presetFreecadStepExport(freecad, [authorityRef("geometry-kernel")]);

test("matrix lists tools sorted with license mapping", () => {
  const summary = summarizeCapabilityMatrix({
    descriptors: [freecad, blender],
    exchangeRecords: [],
    licenseRecords: [freecadLicense, blenderLicense],
  });
  assert.equal(summary.toolCount, 2);
  assert.deepEqual(
    summary.tools.map((t) => t.toolId),
    ["blender-bpy-headless", "freecad-console"],
  );
  const blenderEntry = summary.tools[0];
  if (blenderEntry === undefined) {
    throw new Error("expected a blender entry");
  }
  assert.equal(blenderEntry.licenseId, "gpl-3.0-or-later");
  assert.equal(blenderEntry.copyleft, "strong-copyleft");
  assert.equal(blenderEntry.processKind, "bpy-headless");
  const freecadEntry = summary.tools[1];
  if (freecadEntry === undefined) {
    throw new Error("expected a freecad entry");
  }
  assert.equal(freecadEntry.copyleft, "weak-copyleft");
});

test("format coverage merges tools deterministically", () => {
  const summary = summarizeCapabilityMatrix({
    descriptors: [blender, freecad],
    exchangeRecords: [objExport],
    licenseRecords: [blenderLicense, freecadLicense],
  });
  const obj = summary.formats.find((f) => f.formatId === "obj");
  if (obj === undefined) {
    throw new Error("expected obj coverage");
  }
  assert.deepEqual(obj.importTools, ["blender-bpy-headless", "freecad-console"]);
  assert.deepEqual(obj.exportTools, ["blender-bpy-headless", "freecad-console"]);
  const step = summary.formats.find((f) => f.formatId === "step");
  if (step === undefined) {
    throw new Error("expected step coverage");
  }
  assert.deepEqual(step.importTools, ["freecad-console"]);
  assert.deepEqual(step.exportTools, ["freecad-console"]);
  assert.equal(step.formatClass, "brep");
  const blend = summary.formats.find((f) => f.formatId === "blend");
  if (blend === undefined) {
    throw new Error("expected blend coverage");
  }
  assert.deepEqual(blend.importTools, ["blender-bpy-headless"]);
  const blenderEntry = summary.tools.find((t) => t.toolId === "blender-bpy-headless");
  if (blenderEntry === undefined) {
    throw new Error("expected a blender entry");
  }
  assert.equal(blenderEntry.exchangeRecordCount, 1);
  assert.equal(summary.totalExchangeRecords, 1);
});

test("matrix digest is stable and input-order independent", () => {
  const a = summarizeCapabilityMatrix({
    descriptors: [blender, freecad],
    exchangeRecords: [objExport, stepExport],
    licenseRecords: [blenderLicense, freecadLicense],
  });
  const b = summarizeCapabilityMatrix({
    descriptors: [freecad, blender],
    exchangeRecords: [stepExport, objExport],
    licenseRecords: [freecadLicense, blenderLicense],
  });
  assert.equal(a.digest, b.digest);
  assert.match(a.digest, /^[0-9a-f]{64}$/);
});

test("missing license records surface as null, not guesses", () => {
  const summary = summarizeCapabilityMatrix({
    descriptors: [blender],
    exchangeRecords: [],
    licenseRecords: [],
  });
  const entry = summary.tools[0];
  if (entry === undefined) {
    throw new Error("expected a tool entry");
  }
  assert.equal(entry.licenseId, null);
  assert.equal(entry.copyleft, null);
});

test("summary line and totals are deterministic", () => {
  const summary = summarizeCapabilityMatrix({
    descriptors: [blender, freecad],
    exchangeRecords: [objExport],
    licenseRecords: [blenderLicense, freecadLicense],
  });
  assert.equal(summary.kind, "capability-matrix-summary");
  assert.equal(summary.summary, "2 tools, 16 formats, 1 exchange records");
  assert.equal(summary.formats.length, 16);
  assert.equal(summary.toolCount, 2);
});
