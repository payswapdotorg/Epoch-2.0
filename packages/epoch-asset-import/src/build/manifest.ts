import { sha256Canonical } from "../canonical.js";
import type { HexDigest } from "../canonical.js";
import { CONTRACT_REVISION } from "../contract.js";
import type { FidelityDeclaration } from "../types/fidelity.js";
import type {
  ImportManifest,
  NormalizedRecord,
  ProvenanceLink,
  SourceAssetIdentity,
  TargetRepresentation,
} from "../types/manifest.js";
import { NORMALIZED_RECORD_KINDS } from "../types/manifest.js";
import type {
  NormalizeFailureKind,
  NormalizeImportManifestInput,
  NormalizeImportManifestResult,
  NormalizeRecordInput,
} from "../types/normalization.js";
import {
  isHexString64,
  isIso8601Utc,
  isPlainObject,
  kebabId,
  nonEmptyString,
  nonNegativeInteger,
} from "../validate.js";
import { applyFidelityGate } from "./fidelity.js";
import { getFormatDescriptor } from "./formats.js";

function rejected(kind: NormalizeFailureKind, detail: string): NormalizeImportManifestResult {
  return { status: "rejected", failure: { kind, detail } };
}

function isValidDeclaration(declaration: FidelityDeclaration | null): boolean {
  if (declaration === null) return true;
  if (!isPlainObject(declaration)) return false;
  return (
    typeof declaration.preservesMeshes === "boolean" &&
    typeof declaration.preservesMaterials === "boolean" &&
    typeof declaration.preservesSkeletons === "boolean" &&
    typeof declaration.preservesAnimations === "boolean" &&
    typeof declaration.preservesPbr === "boolean"
  );
}

function isKnownKind(kind: string): boolean {
  return (NORMALIZED_RECORD_KINDS as readonly string[]).includes(kind);
}

export function normalizeImportManifest(
  input: NormalizeImportManifestInput,
): NormalizeImportManifestResult {
  if (!isPlainObject(input)) return rejected("invalid-input", "input must be a plain object");
  if (!kebabId(input.manifestId)) {
    return rejected(
      "invalid-input",
      `manifestId must be a kebab id: got ${JSON.stringify(input.manifestId)}`,
    );
  }
  if (!isPlainObject(input.source))
    return rejected("invalid-input", "source must be a plain object");
  if (!isHexString64(input.source.digest)) {
    return rejected("invalid-input", "source.digest must be 64 lowercase hex characters");
  }
  if (!nonEmptyString(input.source.formatId)) {
    return rejected("invalid-input", "source.formatId must be a non-empty string");
  }
  if (!nonNegativeInteger(input.source.byteSize)) {
    return rejected("invalid-input", "source.byteSize must be a non-negative integer");
  }
  if (!isIso8601Utc(input.generatedAt)) {
    return rejected(
      "invalid-input",
      "generatedAt must be an ISO-8601 UTC timestamp (timestamps are inputs, never generated)",
    );
  }
  if (!Array.isArray(input.targetKinds))
    return rejected("invalid-input", "targetKinds must be an array");
  const targetKindStrings: readonly string[] = [...input.targetKinds];
  for (const kind of targetKindStrings) {
    if (!isKnownKind(kind)) {
      return rejected("invalid-input", `unknown target record kind: ${JSON.stringify(kind)}`);
    }
  }
  if (!isValidDeclaration(input.declaration)) {
    return rejected("invalid-input", "declaration must be null or an object of five booleans");
  }
  if (!Array.isArray(input.records)) return rejected("invalid-input", "records must be an array");
  const inputRecords: readonly NormalizeRecordInput[] = [...input.records];
  const seenRecordIds = new Set<string>();
  for (const record of inputRecords) {
    if (!isPlainObject(record))
      return rejected("invalid-input", "each record must be a plain object");
    if (!kebabId(record.recordId)) {
      return rejected(
        "invalid-input",
        `record id must be a kebab id: got ${JSON.stringify(record.recordId)}`,
      );
    }
    if (seenRecordIds.has(record.recordId)) {
      return rejected("invalid-input", `duplicate record id: ${record.recordId}`);
    }
    seenRecordIds.add(record.recordId);
    if (!isKnownKind(record.kind)) {
      return rejected("invalid-input", `unknown record kind: ${JSON.stringify(record.kind)}`);
    }
  }

  const format = getFormatDescriptor(input.source.formatId);
  if (format === null) {
    return rejected(
      "unknown-format",
      `no format descriptor for format id: ${JSON.stringify(input.source.formatId)}`,
    );
  }

  const gate = applyFidelityGate({ format, declaration: input.declaration });
  if (gate.status === "rejected") {
    return rejected("fidelity-gate-rejected", `${gate.reason.kind}: ${gate.reason.detail}`);
  }

  const source: SourceAssetIdentity = {
    digest: input.source.digest as HexDigest,
    formatId: format.formatId,
    byteSize: input.source.byteSize,
  };
  const target: TargetRepresentation = {
    kind: "normalized-records",
    declaredKinds: [...input.targetKinds],
  };
  const records: NormalizedRecord[] = [];
  const provenance: ProvenanceLink[] = [];
  for (const record of inputRecords) {
    const digest = sha256Canonical(record.payload);
    records.push({ recordId: record.recordId, kind: record.kind, digest, payload: record.payload });
    provenance.push({
      sourceDigest: source.digest,
      recordId: record.recordId,
      recordKind: record.kind,
      recordDigest: digest,
    });
  }
  const manifest: ImportManifest = {
    manifestId: input.manifestId,
    contractRevision: CONTRACT_REVISION,
    fidelityClass: format.fidelityClass,
    source,
    target,
    records,
    provenance,
    generatedAt: input.generatedAt,
  };
  return { status: "ok", manifest, manifestDigest: sha256Canonical(manifest) };
}
