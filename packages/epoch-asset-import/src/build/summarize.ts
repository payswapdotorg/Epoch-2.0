import type { ImportManifest, NormalizedRecordKind } from "../types/manifest.js";
import type { ImportSummary } from "../types/normalization.js";

export function summarizeImport(manifest: ImportManifest): ImportSummary {
  const recordCounts: Record<NormalizedRecordKind, number> = {
    mesh: 0,
    material: 0,
    skeleton: 0,
    animation: 0,
    "scene-graph": 0,
    texture: 0,
    metadata: 0,
  };
  for (const record of manifest.records) {
    recordCounts[record.kind] += 1;
  }
  return {
    manifestId: manifest.manifestId,
    formatId: manifest.source.formatId,
    fidelityClass: manifest.fidelityClass,
    sourceDigest: manifest.source.digest,
    sourceByteSize: manifest.source.byteSize,
    totalRecords: manifest.records.length,
    provenanceLinks: manifest.provenance.length,
    recordCounts,
  };
}
