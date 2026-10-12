import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../src/canonical.js";
import {
  buildResultProjectionRecord,
  resultProjectionRecordDigest,
  summarizeProjectionCoverage,
  validateResultProjectionRecord,
} from "../src/build/projection.js";
import type { Sha256Hex } from "../src/types/branded.js";
import type {
  ResultProjectionRecord,
  ResultProjectionRejection,
  ResultProjectionValidation,
} from "../src/types/projection.js";

function digest(seed: string): Sha256Hex {
  return sha256Hex(seed);
}

function baseInput() {
  return {
    id: "run-001-pressure-on-room",
    datasetDigest: digest("dataset-run-001"),
    worldEntityOwnerPackage: "epoch-world-model",
    worldEntityDigest: digest("world-room"),
    derivationKind: "simulation-solver-output" as const,
    derivationStatement:
      "Pressure field projected from the run-001 solver output onto the referenced room entity.",
    inputDigests: [
      {
        ownerPackage: "epoch-world-model",
        artifactKind: "world-entity",
        digest: digest("world-room"),
      },
      {
        ownerPackage: "epoch-solver",
        artifactKind: "solver-run",
        digest: digest("solver-run-001"),
      },
    ],
  };
}

function expectValue(result: ResultProjectionValidation): ResultProjectionRecord {
  if (result.ok) {
    return result.value;
  }
  throw new Error(
    `expected a value, got rejections: ${result.rejections.map((r) => r.kind).join(", ")}`,
  );
}

function expectRejectionKinds(result: ResultProjectionValidation): readonly string[] {
  if (!result.ok) {
    return result.rejections.map((rejection) => rejection.kind);
  }
  throw new Error("expected rejections, got a value");
}

function findRejection<K extends ResultProjectionRejection["kind"]>(
  result: ResultProjectionValidation,
  kind: K,
): Extract<ResultProjectionRejection, { kind: K }> {
  if (result.ok) {
    throw new Error("expected rejections, got a value");
  }
  const found = result.rejections.find(
    (rejection): rejection is Extract<ResultProjectionRejection, { kind: K }> =>
      rejection.kind === kind,
  );
  if (found === undefined) {
    throw new Error(
      `expected a "${kind}" rejection, got: ${result.rejections.map((r) => r.kind).join(", ")}`,
    );
  }
  return found;
}

test("the builder produces a projection-only record with normalized input refs", () => {
  const input = baseInput();
  input.inputDigests.push({
    ownerPackage: "epoch-world-model",
    artifactKind: "world-entity",
    digest: digest("world-room"),
  });
  const record = buildResultProjectionRecord(input);
  assert.equal(record.authority, "projection-only");
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.datasetRef.ownerPackage, "epoch-results-paraview");
  assert.equal(record.datasetRef.digest, digest("dataset-run-001"));
  assert.equal(record.derivation.inputRefs.length, 2);
  assert.deepEqual(
    record.derivation.inputRefs.map((ref) => ref.ownerPackage),
    ["epoch-solver", "epoch-world-model"],
  );
});

test("the builder output validates", () => {
  const record = buildResultProjectionRecord(baseInput());
  const value = expectValue(validateResultProjectionRecord(record));
  assert.equal(value.id, "run-001-pressure-on-room");
});

test("an authority other than projection-only is rejected", () => {
  const record = buildResultProjectionRecord(baseInput());
  const invalid = { ...record, authority: "execution" };
  const rejection = findRejection(validateResultProjectionRecord(invalid), "invalid-authority");
  assert.ok(rejection.message.includes("projection-only"));
});

test("an unknown derivation kind is rejected", () => {
  const record = buildResultProjectionRecord(baseInput());
  const invalid = {
    ...record,
    derivation: { ...record.derivation, kind: "guessed" },
  };
  const rejection = findRejection(
    validateResultProjectionRecord(invalid),
    "unknown-derivation-kind",
  );
  assert.equal(rejection.derivation, "guessed");
});

test("empty derivation inputs are rejected", () => {
  const record = buildResultProjectionRecord(baseInput());
  const invalid = {
    ...record,
    derivation: { ...record.derivation, inputRefs: [] },
  };
  const kinds = expectRejectionKinds(validateResultProjectionRecord(invalid));
  assert.ok(kinds.includes("empty-derivation-inputs"));
});

test("a malformed world entity reference is rejected", () => {
  const record = buildResultProjectionRecord(baseInput());
  const invalid = {
    ...record,
    worldEntityRef: {
      ownerPackage: "BAD PACKAGE",
      artifactKind: "world-entity",
      digest: "nope",
    },
  };
  const kinds = expectRejectionKinds(validateResultProjectionRecord(invalid));
  assert.ok(kinds.includes("invalid-world-entity-ref"));
});

test("an invalid id is rejected", () => {
  const record = buildResultProjectionRecord(baseInput());
  const invalid = { ...record, id: "Not Kebab" };
  const kinds = expectRejectionKinds(validateResultProjectionRecord(invalid));
  assert.ok(kinds.includes("invalid-id"));
});

test("projection record digests are deterministic lowercase hex", () => {
  const first = buildResultProjectionRecord(baseInput());
  const second = buildResultProjectionRecord(baseInput());
  const firstDigest = resultProjectionRecordDigest(first);
  assert.equal(firstDigest, resultProjectionRecordDigest(second));
  assert.match(firstDigest, /^[0-9a-f]{64}$/);
});

test("projection record digests change when the statement changes", () => {
  const first = buildResultProjectionRecord(baseInput());
  const second = buildResultProjectionRecord({
    ...baseInput(),
    derivationStatement: "A different, honest derivation statement.",
  });
  assert.notEqual(resultProjectionRecordDigest(first), resultProjectionRecordDigest(second));
});

test("coverage summary counts records, entities, datasets and inputs", () => {
  const recordA = buildResultProjectionRecord(baseInput());
  const recordB = buildResultProjectionRecord({
    ...baseInput(),
    id: "run-001-velocity-on-room",
  });
  const recordC = buildResultProjectionRecord({
    ...baseInput(),
    id: "run-002-pressure-on-wing",
    worldEntityDigest: digest("world-wing"),
    derivationKind: "post-processed" as const,
    inputDigests: [
      {
        ownerPackage: "epoch-world-model",
        artifactKind: "world-entity",
        digest: digest("world-wing"),
      },
    ],
  });
  const summary = summarizeProjectionCoverage([recordA, recordB, recordC]);
  assert.equal(summary.totalRecords, 3);
  assert.equal(summary.distinctWorldEntities, 2);
  assert.equal(summary.distinctDatasets, 1);
  assert.equal(summary.distinctInputArtifacts, 3);
  assert.deepEqual(summary.byDerivationKind, [
    { kind: "post-processed", count: 1 },
    { kind: "simulation-solver-output", count: 2 },
  ]);
});

test("coverage summary lists projected world entity digests sorted and unique", () => {
  const recordA = buildResultProjectionRecord(baseInput());
  const recordC = buildResultProjectionRecord({
    ...baseInput(),
    id: "run-002-pressure-on-wing",
    worldEntityDigest: digest("world-wing"),
    inputDigests: [
      {
        ownerPackage: "epoch-world-model",
        artifactKind: "world-entity",
        digest: digest("world-wing"),
      },
    ],
  });
  const summary = summarizeProjectionCoverage([recordC, recordA]);
  assert.deepEqual(
    summary.projectedWorldEntityDigests,
    [digest("world-room"), digest("world-wing")].sort(),
  );
});

test("coverage summary of an empty record set is all zeros", () => {
  const summary = summarizeProjectionCoverage([]);
  assert.equal(summary.totalRecords, 0);
  assert.equal(summary.distinctWorldEntities, 0);
  assert.equal(summary.distinctDatasets, 0);
  assert.equal(summary.distinctInputArtifacts, 0);
  assert.deepEqual(summary.byDerivationKind, []);
  assert.deepEqual(summary.projectedWorldEntityDigests, []);
});
