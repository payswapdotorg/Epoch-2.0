import { test } from "node:test";
import * as assert from "node:assert/strict";
import { normalizeImportManifest } from "../src/build/manifest.js";
import { summarizeImport } from "../src/build/summarize.js";
import { validateNormalizedAsset } from "../src/build/validate.js";
import type {
  ImportManifest,
  NormalizedRecord,
  ProvenanceLink,
  SourceDigest,
} from "../src/types/manifest.js";
import type {
  NormalizeImportManifestInput,
  ValidateNormalizedAssetResult,
} from "../src/types/normalization.js";

function baseInput(): NormalizeImportManifestInput {
  return {
    manifestId: "asset-import-002",
    source: { digest: "c".repeat(64), formatId: "fbx", byteSize: 4096 },
    targetKinds: ["mesh", "material"],
    declaration: {
      preservesMeshes: true,
      preservesMaterials: true,
      preservesSkeletons: true,
      preservesAnimations: true,
      preservesPbr: true,
    },
    records: [
      { recordId: "mesh-001", kind: "mesh", payload: { positions: [0, 0, 0], faces: 4 } },
      { recordId: "mesh-002", kind: "mesh", payload: { positions: [1, 1, 1], faces: 2 } },
      {
        recordId: "material-001",
        kind: "material",
        payload: { name: "Skin", baseColor: [0.8, 0.2, 0.2, 1] },
      },
    ],
    generatedAt: "2026-02-01T12:00:00Z",
  };
}

function normalizedManifest(): ImportManifest {
  const result = normalizeImportManifest(baseInput());
  if (result.status !== "ok") throw new Error(`expected ok: ${JSON.stringify(result.failure)}`);
  return result.manifest;
}

function requireRecord(manifest: ImportManifest, id: string): NormalizedRecord {
  const record = manifest.records.find((r) => r.recordId === id);
  if (record === undefined) throw new Error(`missing record: ${id}`);
  return record;
}

function requireLink(manifest: ImportManifest, id: string): ProvenanceLink {
  const link = manifest.provenance.find((p) => p.recordId === id);
  if (link === undefined) throw new Error(`missing link: ${id}`);
  return link;
}

function failureKinds(result: ValidateNormalizedAssetResult): Set<string> {
  if (result.status !== "invalid") throw new Error("expected invalid");
  return new Set(result.failures.map((failure) => failure.kind));
}

test("summarizeImport counts records per kind", () => {
  const summary = summarizeImport(normalizedManifest());
  assert.equal(summary.totalRecords, 3);
  assert.equal(summary.recordCounts.mesh, 2);
  assert.equal(summary.recordCounts.material, 1);
  assert.equal(summary.recordCounts.animation, 0);
  assert.equal(summary.recordCounts.metadata, 0);
});

test("summarizeImport carries source identity and provenance totals", () => {
  const summary = summarizeImport(normalizedManifest());
  assert.equal(summary.manifestId, "asset-import-002");
  assert.equal(summary.formatId, "fbx");
  assert.equal(summary.fidelityClass, "full-fidelity");
  assert.equal(summary.sourceDigest, "c".repeat(64));
  assert.equal(summary.sourceByteSize, 4096);
  assert.equal(summary.provenanceLinks, 3);
});

test("a normalized manifest validates as valid", () => {
  assert.deepEqual(validateNormalizedAsset(normalizedManifest()), { status: "valid" });
});

test("tampered payloads fail digest validation", () => {
  const manifest = normalizedManifest();
  const tampered: ImportManifest = {
    ...manifest,
    records: manifest.records.map((record) =>
      record.recordId === "mesh-001"
        ? { ...record, payload: { positions: [9, 9, 9], faces: 4 } }
        : record,
    ),
  };
  assert.ok(failureKinds(validateNormalizedAsset(tampered)).has("digest-mismatch"));
});

test("records without provenance links are orphans", () => {
  const manifest = normalizedManifest();
  const orphaned: ImportManifest = {
    ...manifest,
    provenance: manifest.provenance.filter((link) => link.recordId !== "mesh-001"),
  };
  assert.ok(failureKinds(validateNormalizedAsset(orphaned)).has("orphan-record"));
});

test("provenance links without records are orphans", () => {
  const manifest = normalizedManifest();
  const ghost: ImportManifest = {
    ...manifest,
    provenance: [
      ...manifest.provenance,
      { ...requireLink(manifest, "mesh-001"), recordId: "ghost-001" },
    ],
  };
  assert.ok(failureKinds(validateNormalizedAsset(ghost)).has("orphan-record"));
});

test("provenance links bound to a foreign source digest fail", () => {
  const manifest = normalizedManifest();
  const foreign: ImportManifest = {
    ...manifest,
    provenance: manifest.provenance.map((link) =>
      link.recordId === "mesh-001"
        ? { ...link, sourceDigest: "b".repeat(64) as SourceDigest }
        : link,
    ),
  };
  assert.ok(failureKinds(validateNormalizedAsset(foreign)).has("provenance-source-mismatch"));
});

test("duplicate record ids fail validation", () => {
  const manifest = normalizedManifest();
  const duplicated: ImportManifest = {
    ...manifest,
    records: [...manifest.records, requireRecord(manifest, "mesh-001")],
    provenance: [...manifest.provenance, requireLink(manifest, "mesh-001")],
  };
  assert.ok(failureKinds(validateNormalizedAsset(duplicated)).has("duplicate-record-id"));
});

test("records outside the declared target kinds fail", () => {
  const manifest = normalizedManifest();
  const undeclared: ImportManifest = {
    ...manifest,
    target: { ...manifest.target, declaredKinds: ["material"] },
  };
  assert.ok(failureKinds(validateNormalizedAsset(undeclared)).has("undeclared-record-kind"));
});
