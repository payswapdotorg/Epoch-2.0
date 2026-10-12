import { test } from "node:test";
import assert from "node:assert/strict";
import { resultDatasetDigest, validateResultDataset } from "../src/build/dataset.js";
import type {
  ResultDataset,
  ResultDatasetRejection,
  ResultDatasetValidation,
} from "../src/types/dataset.js";

function baseDataset() {
  return {
    schemaVersion: 1,
    id: "cfd-run-001-results",
    title: "CFD run 001 result fields",
    meshRefs: [{ ownerPackage: "epoch-render-mesh", artifactKind: "mesh", digest: "a".repeat(64) }],
    quantityUnits: [
      { quantity: "pressure", units: "Pa" },
      { quantity: "velocity", units: "m/s" },
    ],
    fields: [
      {
        name: "static-pressure",
        quantity: "pressure",
        units: "Pa",
        association: "point",
        dataType: "float64",
        encoding: "inline",
        componentCount: 1,
        valueRange: { min: 0, max: 10 },
        values: [0, 5, 10],
      },
      {
        name: "velocity",
        quantity: "velocity",
        units: "m/s",
        association: "point",
        dataType: "float32",
        encoding: "inline",
        componentCount: 3,
        valueRange: { min: -1, max: 1 },
        values: [-1, 0, 1, 0.5, 0.5, 0.5],
      },
    ],
    timeStep: { index: 0, value: 0, units: "s" },
  };
}

function expectValue(result: ResultDatasetValidation): ResultDataset {
  if (result.ok) {
    return result.value;
  }
  throw new Error(
    `expected a value, got rejections: ${result.rejections.map((r) => r.kind).join(", ")}`,
  );
}

function expectRejectionKinds(result: ResultDatasetValidation): readonly string[] {
  if (!result.ok) {
    return result.rejections.map((rejection) => rejection.kind);
  }
  throw new Error("expected rejections, got a value");
}

function findRejection<K extends ResultDatasetRejection["kind"]>(
  result: ResultDatasetValidation,
  kind: K,
): Extract<ResultDatasetRejection, { kind: K }> {
  if (result.ok) {
    throw new Error("expected rejections, got a value");
  }
  const found = result.rejections.find(
    (rejection): rejection is Extract<ResultDatasetRejection, { kind: K }> =>
      rejection.kind === kind,
  );
  if (found === undefined) {
    throw new Error(
      `expected a "${kind}" rejection, got: ${result.rejections.map((r) => r.kind).join(", ")}`,
    );
  }
  return found;
}

test("a well-formed result dataset validates", () => {
  const value = expectValue(validateResultDataset(baseDataset()));
  assert.equal(value.id, "cfd-run-001-results");
  assert.equal(value.fields.length, 2);
  assert.equal(value.fields[0]?.association, "point");
  assert.equal(value.quantityUnits[0]?.units, "Pa");
});

test("a non-record input is rejected as invalid schema version", () => {
  const kinds = expectRejectionKinds(validateResultDataset(42));
  assert.ok(kinds.includes("invalid-schema-version"));
});

test("unknown association is rejected", () => {
  const dataset = baseDataset();
  const field = dataset.fields[0];
  assert.ok(field !== undefined);
  field.association = "vertex";
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("unknown-association"));
  const rejection = findRejection(validateResultDataset(dataset), "unknown-association");
  assert.equal(rejection.association, "vertex");
});

test("an inline field without values is rejected as empty-field", () => {
  const dataset = baseDataset();
  const field = dataset.fields[0];
  assert.ok(field !== undefined);
  field.values = [];
  const rejection = findRejection(validateResultDataset(dataset), "empty-field");
  assert.equal(rejection.field, "static-pressure");
});

test("unit mismatch is rejected with expected and actual units", () => {
  const dataset = baseDataset();
  const field = dataset.fields[0];
  assert.ok(field !== undefined);
  field.units = "kPa";
  const rejection = findRejection(validateResultDataset(dataset), "unit-mismatch");
  assert.equal(rejection.field, "static-pressure");
  assert.equal(rejection.quantity, "pressure");
  assert.equal(rejection.expectedUnits, "Pa");
  assert.equal(rejection.actualUnits, "kPa");
});

test("a field referencing an unregistered quantity is rejected", () => {
  const dataset = baseDataset();
  const field = dataset.fields[0];
  assert.ok(field !== undefined);
  field.quantity = "temperature";
  const rejection = findRejection(validateResultDataset(dataset), "unknown-quantity");
  assert.equal(rejection.quantity, "temperature");
});

test("an inverted value range is rejected", () => {
  const dataset = baseDataset();
  const field = dataset.fields[0];
  assert.ok(field !== undefined);
  field.valueRange = { min: 5, max: 1 };
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("invalid-value-range"));
});

test("inline values not a multiple of componentCount are rejected", () => {
  const dataset = baseDataset();
  const field = dataset.fields[1];
  assert.ok(field !== undefined);
  field.values = [1, 2];
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("values-length-mismatch"));
});

test("a declared range that does not bound inline values is rejected", () => {
  const dataset = baseDataset();
  const field = dataset.fields[0];
  assert.ok(field !== undefined);
  field.values = [0, 50];
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("range-not-bounding"));
});

test("external encoding without a payload digest is rejected", () => {
  const dataset = {
    ...baseDataset(),
    fields: [
      {
        name: "static-pressure",
        quantity: "pressure",
        units: "Pa",
        association: "point",
        dataType: "float64",
        encoding: "external",
        componentCount: 1,
        valueRange: { min: 0, max: 10 },
      },
    ],
  };
  const rejection = findRejection(validateResultDataset(dataset), "missing-external-payload-ref");
  assert.equal(rejection.field, "static-pressure");
});

test("external encoding with leftover inline values is rejected", () => {
  const dataset = {
    ...baseDataset(),
    fields: [
      {
        name: "static-pressure",
        quantity: "pressure",
        units: "Pa",
        association: "point",
        dataType: "float64",
        encoding: "external",
        componentCount: 1,
        valueRange: { min: 0, max: 10 },
        values: [1],
        externalPayloadRef: "c".repeat(64),
      },
    ],
  };
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("unexpected-inline-values"));
});

test("missing mesh references are rejected", () => {
  const dataset = { ...baseDataset(), meshRefs: [] };
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("missing-mesh-refs"));
});

test("a malformed mesh reference digest is rejected", () => {
  const dataset = baseDataset();
  const ref = dataset.meshRefs[0];
  assert.ok(ref !== undefined);
  ref.digest = "not-a-digest";
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("invalid-mesh-ref"));
});

test("duplicate field names are rejected", () => {
  const dataset = baseDataset();
  const second = dataset.fields[1];
  assert.ok(second !== undefined);
  second.name = "static-pressure";
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("duplicate-field-name"));
});

test("dataset digests are deterministic lowercase hex", () => {
  const first = expectValue(validateResultDataset(baseDataset()));
  const second = expectValue(validateResultDataset(baseDataset()));
  const firstDigest = resultDatasetDigest(first);
  assert.equal(firstDigest, resultDatasetDigest(second));
  assert.match(firstDigest, /^[0-9a-f]{64}$/);
});

test("dataset digests change when content changes", () => {
  const first = expectValue(validateResultDataset(baseDataset()));
  const changed = { ...first, title: "CFD run 001 result fields (revised)" };
  assert.notEqual(resultDatasetDigest(changed), resultDatasetDigest(first));
});

test("multiple rejections accumulate in one pass", () => {
  const dataset = baseDataset();
  const field = dataset.fields[0];
  assert.ok(field !== undefined);
  field.association = "vertex";
  field.units = "kPa";
  const kinds = expectRejectionKinds(validateResultDataset(dataset));
  assert.ok(kinds.includes("unknown-association"));
  assert.ok(kinds.includes("unit-mismatch"));
});
