import { test } from "node:test";
import * as assert from "node:assert/strict";
import { normalizeImportManifest } from "../src/build/manifest.js";
import { sha256Canonical } from "../src/canonical.js";
import type { HexDigest } from "../src/canonical.js";
import type { ImportManifest, NormalizedRecord } from "../src/types/manifest.js";
import type {
  NormalizeFailure,
  NormalizeImportManifestInput,
  NormalizeImportManifestResult,
} from "../src/types/normalization.js";

type OkResult = { manifest: ImportManifest; manifestDigest: HexDigest };

function baseInput(): NormalizeImportManifestInput {
  return {
    manifestId: "asset-import-001",
    source: { digest: "a".repeat(64), formatId: "gltf2", byteSize: 1024 },
    targetKinds: ["mesh", "material"],
    declaration: {
      preservesMeshes: true,
      preservesMaterials: true,
      preservesSkeletons: true,
      preservesAnimations: true,
      preservesPbr: true,
    },
    records: [
      {
        recordId: "mesh-001",
        kind: "mesh",
        payload: { positions: [0, 1, 2], normals: [0, 0, 1], faces: 2 },
      },
      {
        recordId: "material-001",
        kind: "material",
        payload: { name: "Default", metallicRoughness: [0.1, 0.5] },
      },
    ],
    generatedAt: "2026-01-15T00:00:00.000Z",
  };
}

function okResult(): OkResult {
  const result: NormalizeImportManifestResult = normalizeImportManifest(baseInput());
  if (result.status !== "ok")
    throw new Error(`expected ok, got: ${JSON.stringify(result.failure)}`);
  return result;
}

function failureOf(input: NormalizeImportManifestInput): NormalizeFailure {
  const result: NormalizeImportManifestResult = normalizeImportManifest(input);
  if (result.status !== "rejected") throw new Error("expected rejection");
  return result.failure;
}

test("normalizes a valid import into a provenance-linked manifest", () => {
  const result = okResult();
  assert.match(result.manifestDigest, /^[0-9a-f]{64}$/);
  assert.equal(result.manifest.manifestId, "asset-import-001");
  assert.equal(result.manifest.source.formatId, "gltf2");
  assert.equal(result.manifest.fidelityClass, "full-fidelity");
  assert.equal(result.manifest.records.length, 2);
});

test("record digests equal sha256Canonical of the payloads", () => {
  const { manifest } = okResult();
  for (const record of manifest.records) {
    assert.equal(record.digest, sha256Canonical(record.payload));
  }
});

test("provenance links mirror records and bind to the source digest", () => {
  const { manifest } = okResult();
  assert.equal(manifest.provenance.length, manifest.records.length);
  for (const link of manifest.provenance) {
    assert.equal(link.sourceDigest, manifest.source.digest);
    const record: NormalizedRecord | undefined = manifest.records.find(
      (r: NormalizedRecord) => r.recordId === link.recordId,
    );
    assert.notEqual(record, undefined);
    assert.equal(record?.digest, link.recordDigest);
    assert.equal(record?.kind, link.recordKind);
  }
});

test("normalization is deterministic", () => {
  const first = normalizeImportManifest(baseInput());
  const second = normalizeImportManifest(baseInput());
  assert.deepEqual(first, second);
  if (first.status === "ok" && second.status === "ok") {
    assert.equal(first.manifestDigest, second.manifestDigest);
  }
});

test("unknown format ids are rejected as unknown-format", () => {
  const input = { ...baseInput(), source: { ...baseInput().source, formatId: "bogus" } };
  assert.equal(failureOf(input).kind, "unknown-format");
});

test("undeclared fidelity is rejected through the gate", () => {
  const failure = failureOf({ ...baseInput(), declaration: null });
  assert.equal(failure.kind, "fidelity-gate-rejected");
  assert.ok(failure.detail.includes("undeclared-fidelity"));
});

test("non-kebab manifest ids are invalid-input", () => {
  assert.equal(failureOf({ ...baseInput(), manifestId: "Bad Id" }).kind, "invalid-input");
});

test("non-hex source digests are invalid-input", () => {
  const input = { ...baseInput(), source: { ...baseInput().source, digest: "XYZ" } };
  assert.equal(failureOf(input).kind, "invalid-input");
});

test("negative byte sizes are invalid-input", () => {
  const input = { ...baseInput(), source: { ...baseInput().source, byteSize: -1 } };
  assert.equal(failureOf(input).kind, "invalid-input");
});

test("non-ISO timestamps are invalid-input", () => {
  assert.equal(failureOf({ ...baseInput(), generatedAt: "not-a-timestamp" }).kind, "invalid-input");
});

test("unknown record kinds and duplicate record ids are invalid-input", () => {
  const badKind = normalizeImportManifest({
    ...baseInput(),
    records: [{ recordId: "weird-001", kind: "particle-system" as unknown as "mesh", payload: {} }],
  });
  if (badKind.status !== "rejected") throw new Error("expected rejection");
  assert.equal(badKind.failure.kind, "invalid-input");

  const duplicated = normalizeImportManifest({
    ...baseInput(),
    records: [
      ...baseInput().records,
      { recordId: "mesh-001", kind: "mesh", payload: { positions: [3, 3, 3] } },
    ],
  });
  if (duplicated.status !== "rejected") throw new Error("expected rejection");
  assert.equal(duplicated.failure.kind, "invalid-input");
});

test("zero records normalize to an empty but valid manifest", () => {
  const result = normalizeImportManifest({ ...baseInput(), records: [] });
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.manifest.records.length, 0);
    assert.equal(result.manifest.provenance.length, 0);
  }
});
