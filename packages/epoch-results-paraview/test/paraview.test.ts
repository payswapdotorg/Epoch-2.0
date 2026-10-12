import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../src/canonical.js";
import {
  buildParaViewPluginRef,
  paraViewPluginRefDigest,
  validateParaViewPluginRef,
} from "../src/build/plugin-ref.js";
import {
  paraViewStateDescriptorDigest,
  validateStateDescriptor,
} from "../src/build/state-descriptor.js";
import type {
  ParaViewStateDescriptor,
  ParaViewStateRejection,
  ParaViewStateValidation,
  ParaViewPluginRefValidation,
} from "../src/types/paraview.js";

function baseDescriptor() {
  return {
    schemaVersion: 1,
    id: "cfd-slice-state",
    title: "Mid-plane slice of run 001",
    datasetRefs: [
      {
        ownerPackage: "epoch-results-paraview",
        artifactKind: "result-dataset",
        digest: "b".repeat(64),
      },
    ],
    representation: "surface",
    colorMap: {
      fieldName: "static-pressure",
      colorMap: "cool-to-warm",
      rangeMode: "automatic",
      manualRange: { min: 0, max: 10 },
      invert: false,
      opacity: 1,
    },
    filters: [
      { kind: "slice", id: "mid-plane", planeNormal: [0, 0, 1], origin: [0, 0, 0.5] },
      {
        kind: "glyph",
        id: "velocity-glyphs",
        appliesTo: "mid-plane",
        vectorFieldName: "velocity",
        scaleFactor: 0.1,
        glyphShape: "arrow",
      },
    ],
    pluginRefs: [
      {
        schemaVersion: 1,
        pluginName: "streamline-tools",
        provider: "kitware-paraview",
        version: "1.2.0",
        capability: "streamline-integration",
      },
    ],
    notes: ["state shared for review"],
  };
}

function expectValue(result: ParaViewStateValidation): ParaViewStateDescriptor {
  if (result.ok) {
    return result.value;
  }
  throw new Error(
    `expected a value, got rejections: ${result.rejections.map((r) => r.kind).join(", ")}`,
  );
}

function expectRejectionKinds(result: ParaViewStateValidation): readonly string[] {
  if (!result.ok) {
    return result.rejections.map((rejection) => rejection.kind);
  }
  throw new Error("expected rejections, got a value");
}

function findRejection<K extends ParaViewStateRejection["kind"]>(
  result: ParaViewStateValidation,
  kind: K,
): Extract<ParaViewStateRejection, { kind: K }> {
  if (result.ok) {
    throw new Error("expected rejections, got a value");
  }
  const found = result.rejections.find(
    (rejection): rejection is Extract<ParaViewStateRejection, { kind: K }> =>
      rejection.kind === kind,
  );
  if (found === undefined) {
    throw new Error(
      `expected a "${kind}" rejection, got: ${result.rejections.map((r) => r.kind).join(", ")}`,
    );
  }
  return found;
}

function pluginRejectionKinds(result: ParaViewPluginRefValidation): readonly string[] {
  if (!result.ok) {
    return result.rejections.map((rejection) => rejection.kind);
  }
  throw new Error("expected rejections, got a value");
}

test("a well-formed state descriptor validates", () => {
  const value = expectValue(validateStateDescriptor(baseDescriptor()));
  assert.equal(value.id, "cfd-slice-state");
  assert.equal(value.filters.length, 2);
  assert.equal(value.colorMap.colorMap, "cool-to-warm");
  assert.equal(value.pluginRefs[0]?.provider, "kitware-paraview");
});

test("an invalid color map name is rejected", () => {
  const descriptor = baseDescriptor();
  descriptor.colorMap.colorMap = "sparkly-rainbow";
  const rejection = findRejection(validateStateDescriptor(descriptor), "invalid-color-map");
  assert.equal(rejection.colorMap, "sparkly-rainbow");
});

test("an unknown filter kind is rejected", () => {
  const descriptor = baseDescriptor();
  const filter = descriptor.filters[0];
  assert.ok(filter !== undefined);
  filter.kind = "warp";
  const rejection = findRejection(validateStateDescriptor(descriptor), "unknown-filter-kind");
  assert.equal(rejection.kindName, "warp");
});

test("a dangling appliesTo is rejected as unknown filter chain", () => {
  const descriptor = baseDescriptor();
  const filter = descriptor.filters[1];
  assert.ok(filter !== undefined);
  filter.appliesTo = "does-not-exist";
  const rejection = findRejection(validateStateDescriptor(descriptor), "unknown-filter-chain");
  assert.equal(rejection.appliesTo, "does-not-exist");
  assert.equal(rejection.filterId, "velocity-glyphs");
});

test("a forward reference in the filter chain is rejected", () => {
  const descriptor = {
    ...baseDescriptor(),
    filters: [
      {
        kind: "slice",
        id: "first-slice",
        appliesTo: "later-glyph",
        planeNormal: [0, 0, 1],
        origin: [0, 0, 0.5],
      },
      {
        kind: "glyph",
        id: "later-glyph",
        vectorFieldName: "velocity",
        scaleFactor: 0.1,
        glyphShape: "arrow",
      },
    ],
  };
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("unknown-filter-chain"));
});

test("duplicate filter ids are rejected", () => {
  const descriptor = {
    ...baseDescriptor(),
    filters: [
      { kind: "slice", id: "same-id", planeNormal: [0, 0, 1], origin: [0, 0, 0.5] },
      {
        kind: "glyph",
        id: "same-id",
        vectorFieldName: "velocity",
        scaleFactor: 0.1,
        glyphShape: "arrow",
      },
    ],
  };
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("duplicate-filter-id"));
});

test("a non-positive glyph scale factor is rejected", () => {
  const descriptor = baseDescriptor();
  const filter = descriptor.filters[1];
  assert.ok(filter !== undefined);
  filter.scaleFactor = 0;
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("invalid-glyph-scale"));
});

test("streamline seed points must be non-empty", () => {
  const descriptor = {
    ...baseDescriptor(),
    filters: [
      {
        kind: "streamline",
        id: "velocity-streamlines",
        vectorFieldName: "velocity",
        seedPoints: [],
        stepLength: 0.01,
        maxSteps: 100,
        integrationDirection: "forward",
      },
    ],
  };
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("invalid-seed-points"));
});

test("streamline maxSteps must be a positive integer", () => {
  const descriptor = {
    ...baseDescriptor(),
    filters: [
      {
        kind: "streamline",
        id: "velocity-streamlines",
        vectorFieldName: "velocity",
        seedPoints: [[0, 0, 0]],
        stepLength: 0.01,
        maxSteps: 0,
        integrationDirection: "forward",
      },
    ],
  };
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("invalid-max-steps"));
});

test("contour iso values must be non-empty", () => {
  const descriptor = {
    ...baseDescriptor(),
    filters: [
      { kind: "contour", id: "pressure-isos", fieldName: "static-pressure", isoValues: [] },
    ],
  };
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("empty-iso-values"));
});

test("opacity outside [0, 1] is rejected", () => {
  const descriptor = baseDescriptor();
  descriptor.colorMap.opacity = 1.5;
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("invalid-opacity"));
});

test("an inverted manual color range is rejected", () => {
  const descriptor = baseDescriptor();
  descriptor.colorMap.rangeMode = "manual";
  descriptor.colorMap.manualRange = { min: 2, max: 1 };
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("invalid-color-range"));
});

test("missing dataset references are rejected", () => {
  const descriptor = { ...baseDescriptor(), datasetRefs: [] };
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("missing-dataset-refs"));
});

test("a zero plane normal is rejected", () => {
  const descriptor = baseDescriptor();
  const filter = descriptor.filters[0];
  assert.ok(filter !== undefined);
  filter.planeNormal = [0, 0, 0];
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("invalid-plane-normal"));
});

test("plugin refs validate and reject typed failures", () => {
  const good = validateParaViewPluginRef({
    schemaVersion: 1,
    pluginName: "streamline-tools",
    provider: "kitware-paraview",
    version: "1.2.0",
    capability: "streamline-integration",
  });
  assert.equal(good.ok, true);
  const bad = validateParaViewPluginRef({
    schemaVersion: 1,
    pluginName: "Bad Plugin",
    provider: "kitware-paraview",
    version: "1.2.0",
    capability: "streamline-integration",
  });
  assert.ok(pluginRejectionKinds(bad).includes("invalid-plugin-name"));
});

test("buildParaViewPluginRef round-trips through validation", () => {
  const params = {
    pluginName: "streamline-tools",
    provider: "kitware-paraview",
    version: "1.2.0",
    capability: "streamline-integration",
    stateDescriptorDigest: sha256Hex("state-1"),
  };
  const refA = buildParaViewPluginRef(params);
  const refB = buildParaViewPluginRef(params);
  const check = validateParaViewPluginRef(refA);
  if (!check.ok) {
    throw new Error("expected the built plugin ref to validate");
  }
  assert.equal(check.value.pluginName, "streamline-tools");
  assert.equal(check.value.stateDescriptorDigest, sha256Hex("state-1"));
  assert.equal(paraViewPluginRefDigest(refA), paraViewPluginRefDigest(refB));
});

test("state descriptor digests are deterministic and content-sensitive", () => {
  const first = expectValue(validateStateDescriptor(baseDescriptor()));
  const second = expectValue(validateStateDescriptor(baseDescriptor()));
  assert.equal(paraViewStateDescriptorDigest(first), paraViewStateDescriptorDigest(second));
  const changed = { ...second, title: "Different title" };
  assert.notEqual(paraViewStateDescriptorDigest(changed), paraViewStateDescriptorDigest(second));
});

test("an invalid plugin ref inside a descriptor is rejected", () => {
  const descriptor = baseDescriptor();
  const ref = descriptor.pluginRefs[0];
  assert.ok(ref !== undefined);
  ref.pluginName = "Bad Plugin";
  const kinds = expectRejectionKinds(validateStateDescriptor(descriptor));
  assert.ok(kinds.includes("invalid-plugin-ref"));
});
