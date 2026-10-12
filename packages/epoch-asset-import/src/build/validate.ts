import { sha256Canonical } from "../canonical.js";
import type { ImportManifest, NormalizedRecord } from "../types/manifest.js";
import type { ValidateNormalizedAssetResult, ValidationFailure } from "../types/normalization.js";
import { isHexString64 } from "../validate.js";

export function validateNormalizedAsset(manifest: ImportManifest): ValidateNormalizedAssetResult {
  const failures: ValidationFailure[] = [];

  if (!isHexString64(manifest.source.digest)) {
    failures.push({
      kind: "invalid-digest",
      detail: "manifest.source.digest must be 64 lowercase hex characters",
    });
  }

  const recordsById = new Map<string, NormalizedRecord>();
  for (const record of manifest.records) {
    if (recordsById.has(record.recordId)) {
      failures.push({
        kind: "duplicate-record-id",
        detail: `duplicate record id: ${record.recordId}`,
        recordId: record.recordId,
      });
      continue;
    }
    recordsById.set(record.recordId, record);

    const computedDigest = sha256Canonical(record.payload);
    if (computedDigest !== record.digest) {
      failures.push({
        kind: "digest-mismatch",
        detail: `payload digest mismatch for record: ${record.recordId}`,
        recordId: record.recordId,
      });
    }
    if (!(manifest.target.declaredKinds as readonly string[]).includes(record.kind)) {
      failures.push({
        kind: "undeclared-record-kind",
        detail: `record kind not declared in target representation: ${record.kind}`,
        recordId: record.recordId,
      });
    }
  }

  const linkedRecordIds = new Set<string>();
  for (const link of manifest.provenance) {
    if (link.sourceDigest !== manifest.source.digest) {
      failures.push({
        kind: "provenance-source-mismatch",
        detail: `provenance link points at a foreign source digest for record: ${link.recordId}`,
        recordId: link.recordId,
      });
    }
    const record = recordsById.get(link.recordId);
    if (record === undefined) {
      failures.push({
        kind: "orphan-record",
        detail: `provenance link without a matching record: ${link.recordId}`,
        recordId: link.recordId,
      });
      continue;
    }
    if (record.digest !== link.recordDigest || record.kind !== link.recordKind) {
      failures.push({
        kind: "orphan-record",
        detail: `provenance link does not match its record: ${link.recordId}`,
        recordId: link.recordId,
      });
      continue;
    }
    linkedRecordIds.add(link.recordId);
  }

  for (const record of manifest.records) {
    if (!linkedRecordIds.has(record.recordId)) {
      failures.push({
        kind: "orphan-record",
        detail: `record without a provenance link: ${record.recordId}`,
        recordId: record.recordId,
      });
    }
  }

  return failures.length === 0 ? { status: "valid" } : { status: "invalid", failures };
}
