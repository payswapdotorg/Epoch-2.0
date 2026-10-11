import type { WorldRevision } from "@zcode/epoch-world-model";
import { canonicalDigest, deepFreeze } from "./canonical.js";
import type {
  CapabilityEvidence,
  Digest,
  EvidenceKind,
  EvidenceSourceRef,
  EvidenceSubjectKind,
} from "./types.js";

/**
 * Convenience constructor for provenance-bearing evidence.
 * Produces frozen, digest-keyed evidence — never world content.
 */
export function evidenceOf(input: {
  readonly kind: EvidenceKind;
  readonly payloadDigest: Digest;
  readonly lifecycleEventDigest?: Digest;
  readonly revisionDigest?: Digest;
  readonly subjectKind?: EvidenceSubjectKind;
  readonly subjectDigest?: Digest;
  readonly label?: string;
}): CapabilityEvidence {
  const sourceRefs: EvidenceSourceRef[] = [];
  if (input.lifecycleEventDigest !== undefined) {
    sourceRefs.push({ lifecycleEventDigest: input.lifecycleEventDigest });
  }
  if (input.revisionDigest !== undefined) {
    sourceRefs.push({ revisionDigest: input.revisionDigest });
  }
  if (sourceRefs.length === 0) {
    sourceRefs.push({ label: input.label ?? "unattributed" });
  }
  const evidence: CapabilityEvidence =
    input.subjectKind === undefined
      ? { kind: input.kind, payloadDigest: input.payloadDigest, sourceRefs }
      : {
          kind: input.kind,
          payloadDigest: input.payloadDigest,
          sourceRefs,
          subject: {
            kind: input.subjectKind,
            digest: input.subjectDigest,
            label: input.label,
          },
        };
  return deepFreeze(evidence);
}

/**
 * Read-only view of a WorldRevision as evidence: the revision is DIGESTED,
 * never stored, never mutated. Only the digest and a digest ref survive.
 */
export function revisionEvidence(
  revision: WorldRevision,
  kind: EvidenceKind = "revision.evaluated",
): CapabilityEvidence {
  const revisionDigest: Digest = canonicalDigest(revision);
  const evidence: CapabilityEvidence = {
    kind,
    payloadDigest: revisionDigest,
    sourceRefs: [{ revisionDigest }],
  };
  return deepFreeze(evidence);
}
