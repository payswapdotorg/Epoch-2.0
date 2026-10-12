import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  FORMAT_CATALOG,
  buildBlenderToolDescriptor,
  buildFreecadToolDescriptor,
  buildGeometryExchangeRecord,
  exchangeRecordDigest,
  formatCatalogEntry,
  isKnownFormatId,
  knownFormatIds,
  presetBlenderObjExport,
  presetFreecadStepExport,
  toDigest,
  toKebabId,
  toNonEmptyString,
} from "../src/index.js";
import type {
  FormatFidelityFlags,
  GeometryExchangeInput,
  SemanticAuthorityKind,
  SemanticAuthorityRef,
} from "../src/index.js";

const blender = buildBlenderToolDescriptor({ toolVersion: "4.2.0" });
const freecad = buildFreecadToolDescriptor({ toolVersion: "1.0.0" });

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

function fidelityFlags(overrides: Partial<FormatFidelityFlags> = {}): FormatFidelityFlags {
  return {
    meshGeometry: false,
    brepGeometry: false,
    materials: false,
    textures: false,
    normals: false,
    uvCoordinates: false,
    animations: false,
    instancing: false,
    sceneHierarchy: false,
    unitsAndScaling: false,
    metadata: false,
    overallLossy: true,
    ...overrides,
  };
}

const baseInput: GeometryExchangeInput = {
  exchangeId: "test-exchange",
  toolId: "blender-bpy-headless",
  toolVersion: "4.2.0",
  direction: "export",
  formatId: "obj",
  fileExtension: ".obj",
  fidelity: fidelityFlags(),
  semanticAuthorityRefs: [authorityRef("world-model")],
  toolSupport: "Blender built-in Wavefront OBJ exporter",
};

test("Blender OBJ export preset records honest lossy mesh fidelity", () => {
  const record = presetBlenderObjExport(blender, [authorityRef("world-model")]);
  assert.equal(record.exchangeId, "blender-obj-export-default");
  assert.equal(record.formatId, "obj");
  assert.equal(record.fileExtension, ".obj");
  assert.equal(record.direction, "export");
  assert.equal(record.fidelity.meshGeometry, true);
  assert.equal(record.fidelity.brepGeometry, false);
  assert.equal(record.fidelity.unitsAndScaling, false);
  assert.equal(record.fidelity.overallLossy, true);
  assert.ok(record.knownLimitations.length >= 2);
  assert.equal(record.semanticAuthorityRefs.length, 1);
});

test("FreeCAD STEP export preset records exact BRep fidelity", () => {
  const record = presetFreecadStepExport(freecad, [authorityRef("geometry-kernel")]);
  assert.equal(record.exchangeId, "freecad-step-export-default");
  assert.equal(record.formatId, "step");
  assert.equal(record.fidelity.brepGeometry, true);
  assert.equal(record.fidelity.unitsAndScaling, true);
  assert.equal(record.fidelity.meshGeometry, false);
  assert.equal(record.fidelity.overallLossy, false);
  assert.equal(record.semanticAuthorityRefs.length, 1);
});

test("exchange builder validates syntax", () => {
  const record = buildGeometryExchangeRecord(baseInput);
  assert.equal(record.exchangeId, "test-exchange");
  assert.equal(record.honestyNotes.length, 2);
  assert.throws(() => buildGeometryExchangeRecord({ ...baseInput, fileExtension: "obj" }));
  assert.throws(() => buildGeometryExchangeRecord({ ...baseInput, formatId: "not kebab" }));
  assert.throws(() =>
    buildGeometryExchangeRecord({
      ...baseInput,
      semanticAuthorityRefs: [{ ...authorityRef("world-model"), recordDigest: "deadbeef" }],
    }),
  );
});

test("exchange digests are stable and preset-distinct", () => {
  const a = presetBlenderObjExport(blender, [authorityRef("world-model")]);
  const b = presetBlenderObjExport(blender, [authorityRef("world-model")]);
  assert.equal(exchangeRecordDigest(a), exchangeRecordDigest(b));
  const c = presetFreecadStepExport(freecad, [authorityRef("geometry-kernel")]);
  assert.notEqual(exchangeRecordDigest(a), exchangeRecordDigest(c));
  assert.match(exchangeRecordDigest(a), /^[0-9a-f]{64}$/);
});

test("format catalog is sorted, unique, and brep-honest", () => {
  const ids = FORMAT_CATALOG.map((e) => e.formatId);
  assert.deepEqual([...ids].sort(), [...ids]);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of FORMAT_CATALOG) {
    assert.ok(e.extensions.length > 0);
    for (const ext of e.extensions) {
      assert.ok(ext.startsWith("."));
    }
  }
  const brepCarriers = FORMAT_CATALOG.filter((e) => e.carriesBRep).map((e) => e.formatId);
  assert.deepEqual(brepCarriers, ["brep", "ifc", "iges", "step"]);
  for (const e of FORMAT_CATALOG.filter((entry) => entry.formatClass === "mesh")) {
    assert.equal(e.carriesBRep, false);
  }
});

test("catalog covers every tool-supported format and lookups behave", () => {
  const catalogIds = knownFormatIds();
  for (const support of [...blender.formats, ...freecad.formats]) {
    assert.ok(
      catalogIds.includes(support.formatId),
      `missing catalog entry for ${support.formatId}`,
    );
  }
  assert.ok(isKnownFormatId("obj"));
  assert.ok(!isKnownFormatId("quux-model"));
  assert.equal(formatCatalogEntry("step")?.formatClass, "brep");
  assert.equal(formatCatalogEntry("nope"), null);
});
