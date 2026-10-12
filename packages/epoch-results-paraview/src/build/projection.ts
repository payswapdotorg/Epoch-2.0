import { canonicalDigest } from "../canonical.js";
import type { CanonicalJsonValue } from "../canonical.js";
import { MODULE_NAME } from "../module.js";
import type { Sha256Hex } from "../types/branded.js";
import type { DigestRef } from "../types/dataset.js";
import type {
  DerivationKindCount,
  ProjectionCoverageSummary,
  ProjectionDerivationKind,
  ResultProjectionInput,
  ResultProjectionRecord,
  ResultProjectionRejection,
  ResultProjectionValidation,
} from "../types/projection.js";
import { PROJECTION_DERIVATION_KINDS } from "../types/projection.js";
import { isDigestRef, isKebabId, isMemberOf, isNonEmptyString, isRecord } from "../validate.js";

function digestRefKey(ref: DigestRef): string {
  return `${ref.ownerPackage}:${ref.artifactKind}:${ref.digest}`;
}

function normalizeInputRefs(refs: readonly DigestRef[]): readonly DigestRef[] {
  const byKey = new Map<string, DigestRef>();
  for (const ref of refs) {
    const key = digestRefKey(ref);
    if (!byKey.has(key)) {
      byKey.set(key, ref);
    }
  }
  return [...byKey.values()].sort((left, right) => {
    const leftKey = digestRefKey(left);
    const rightKey = digestRefKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

/** Builds a projection record binding a dataset digest to a world entity. */
export function buildResultProjectionRecord(input: ResultProjectionInput): ResultProjectionRecord {
  return {
    schemaVersion: 1,
    id: input.id,
    datasetRef: {
      ownerPackage: MODULE_NAME,
      artifactKind: "result-dataset",
      digest: input.datasetDigest,
    },
    worldEntityRef: {
      ownerPackage: input.worldEntityOwnerPackage,
      artifactKind: "world-entity",
      digest: input.worldEntityDigest,
    },
    derivation: {
      kind: input.derivationKind,
      statement: input.derivationStatement,
      inputRefs: normalizeInputRefs(input.inputDigests),
    },
    authority: "projection-only",
  };
}

/** Validates an untrusted projection record with typed rejections. */
export function validateResultProjectionRecord(input: unknown): ResultProjectionValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      rejections: [
        {
          kind: "invalid-schema-version",
          message: "projection record must be a record carrying schemaVersion 1",
        },
      ],
    };
  }
  const rejections: ResultProjectionRejection[] = [];
  if (input.schemaVersion !== 1) {
    rejections.push({
      kind: "invalid-schema-version",
      message: `schemaVersion must be 1 (got ${JSON.stringify(input.schemaVersion)})`,
    });
  }
  if (!isKebabId(input.id)) {
    rejections.push({
      kind: "invalid-id",
      message: "id must be a kebab-id",
    });
  }
  if (!isDigestRef(input.datasetRef)) {
    rejections.push({
      kind: "invalid-dataset-ref",
      message:
        "datasetRef must be {ownerPackage, artifactKind, digest} pointing at a result dataset",
    });
  }
  if (!isDigestRef(input.worldEntityRef)) {
    rejections.push({
      kind: "invalid-world-entity-ref",
      message:
        "worldEntityRef must be {ownerPackage, artifactKind, digest} pointing at a world-model entity",
    });
  }
  if (input.authority !== "projection-only") {
    rejections.push({
      kind: "invalid-authority",
      message: `authority must be "projection-only" (got ${JSON.stringify(input.authority)}): result projections never silently replace baseline world state`,
    });
  }
  const derivation = input.derivation;
  if (!isRecord(derivation)) {
    rejections.push({
      kind: "invalid-derivation",
      message: "derivation must declare {kind, statement, inputRefs}",
    });
  } else {
    if (!isMemberOf(PROJECTION_DERIVATION_KINDS, derivation.kind)) {
      rejections.push({
        kind: "unknown-derivation-kind",
        derivation: String(derivation.kind),
        message: `derivation kind must be one of ${PROJECTION_DERIVATION_KINDS.join(", ")}`,
      });
    }
    if (!isNonEmptyString(derivation.statement)) {
      rejections.push({
        kind: "invalid-derivation-statement",
        message: "derivation statement must be a non-empty string",
      });
    }
    const inputRefs = derivation.inputRefs;
    if (!Array.isArray(inputRefs) || inputRefs.length === 0) {
      rejections.push({
        kind: "empty-derivation-inputs",
        message: "derivation inputRefs must reference at least one input artifact by digest",
      });
    } else {
      const seenKeys = new Set<string>();
      inputRefs.forEach((ref, index) => {
        if (!isDigestRef(ref)) {
          rejections.push({
            kind: "invalid-input-ref",
            index,
            message: `derivation inputRefs[${index}] must be {ownerPackage, artifactKind, digest}`,
          });
          return;
        }
        const key = digestRefKey(ref);
        if (seenKeys.has(key)) {
          rejections.push({
            kind: "duplicate-input-ref",
            ref: key,
            message: `derivation references input ${key} more than once`,
          });
        } else {
          seenKeys.add(key);
        }
      });
    }
  }
  if (rejections.length > 0) {
    return { ok: false, rejections };
  }
  return { ok: true, value: input as unknown as ResultProjectionRecord };
}

/** sha256 over the canonical JSON of a projection record. */
export function resultProjectionRecordDigest(record: ResultProjectionRecord): Sha256Hex {
  return canonicalDigest(record as unknown as CanonicalJsonValue);
}

/** Deterministic coverage summary over projection records. */
export function summarizeProjectionCoverage(
  records: readonly ResultProjectionRecord[],
): ProjectionCoverageSummary {
  const worldEntities = new Set<string>();
  const datasets = new Set<string>();
  const inputArtifacts = new Set<string>();
  const kindCounts = new Map<ProjectionDerivationKind, number>();
  for (const record of records) {
    worldEntities.add(record.worldEntityRef.digest);
    datasets.add(record.datasetRef.digest);
    for (const ref of record.derivation.inputRefs) {
      inputArtifacts.add(digestRefKey(ref));
    }
    const current = kindCounts.get(record.derivation.kind) ?? 0;
    kindCounts.set(record.derivation.kind, current + 1);
  }
  const byDerivationKind: readonly DerivationKindCount[] = [...kindCounts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => (left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0));
  return {
    totalRecords: records.length,
    distinctWorldEntities: worldEntities.size,
    distinctDatasets: datasets.size,
    distinctInputArtifacts: inputArtifacts.size,
    byDerivationKind,
    projectedWorldEntityDigests: [...worldEntities].sort(),
  };
}
