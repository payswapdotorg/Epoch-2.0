import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveInspectorView } from "../src/index.js";
import type { InspectorProjectionInput } from "../src/index.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const entityA = hex("a");

const validInput: InspectorProjectionInput = {
  viewId: "view-wall-w1",
  entityDigest: entityA,
  revision: 3,
  panels: [
    {
      panelId: "panel-identity",
      title: "Identity",
      fields: [
        { kind: "text", label: "Name", value: "Wall W1" },
        { kind: "number", label: "Height", value: 3.2, unit: "m" },
        { kind: "enum", label: "Status", value: "proposed", options: ["proposed", "approved"] },
        { kind: "digest-ref", label: "Geometry", ref: hex("c"), refKind: "world-model-geometry" },
      ],
    },
  ],
  measurements: [
    {
      annotationId: "annot-w1-length",
      measureKind: "length",
      value: 5.5,
      takeoffId: "takeoff-wall-w1-length",
    },
  ],
  derivedFrom: [hex("f")],
};

test("derives an inspector view with derived units and provenance", () => {
  const result = deriveInspectorView(validInput);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  const view = result.value;
  assert.equal(view.viewId, "view-wall-w1");
  assert.equal(view.entityDigest, entityA);
  assert.equal(view.revision, 3);
  assert.equal(view.panels.length, 1);
  assert.equal(view.panels[0]?.fields.length, 4);
  assert.deepEqual(view.derivedFrom, [hex("f")]);
  const measurement = view.measurements[0];
  assert.equal(measurement?.annotationId, "annot-w1-length");
  assert.equal(measurement?.unit, "m");
  assert.equal(measurement?.takeoffId, "takeoff-wall-w1-length");
});

test("rejects an invalid view id", () => {
  const result = deriveInspectorView({ ...validInput, viewId: "View W1" });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "invalid-view-id", viewId: "View W1" });
});

test("rejects an invalid entity digest", () => {
  const result = deriveInspectorView({ ...validInput, entityDigest: "nothex" });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "invalid-entity-digest", entityDigest: "nothex" });
});

test("rejects empty or invalid derivedFrom provenance", () => {
  const empty = deriveInspectorView({ ...validInput, derivedFrom: [] });
  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(empty.rejection, { kind: "empty-derived-from" });

  const invalid = deriveInspectorView({ ...validInput, derivedFrom: ["bad"] });
  assert.equal(invalid.ok, false);
  if (invalid.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(invalid.rejection, { kind: "invalid-derived-from", index: 0, digest: "bad" });
});

test("rejects duplicate panel ids and invalid enum fields", () => {
  const duplicate = deriveInspectorView({
    ...validInput,
    panels: [validInput.panels[0]!, validInput.panels[0]!],
  });
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(duplicate.rejection, { kind: "duplicate-panel-id", panelId: "panel-identity" });

  const badEnum = deriveInspectorView({
    ...validInput,
    panels: [
      {
        panelId: "panel-status",
        title: "Status",
        fields: [{ kind: "enum", label: "Status", value: "bogus", options: ["proposed"] }],
      },
    ],
  });
  assert.equal(badEnum.ok, false);
  if (badEnum.ok) {
    assert.fail("expected rejection");
  }
  assert.equal(badEnum.rejection.kind, "invalid-panel");
  if (badEnum.rejection.kind !== "invalid-panel") {
    assert.fail("wrong rejection kind");
  }
  assert.match(badEnum.rejection.reason, /not among the options/);
});

test("rejects duplicate measurement annotation ids", () => {
  const result = deriveInspectorView({
    ...validInput,
    measurements: [validInput.measurements[0]!, validInput.measurements[0]!],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "duplicate-annotation-id",
    annotationId: "annot-w1-length",
  });
});
