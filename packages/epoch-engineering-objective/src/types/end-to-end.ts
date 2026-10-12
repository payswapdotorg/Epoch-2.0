import type { Sha256Digest } from "../canonical.js";
import type { DigestRef, EvidenceRef, TaskFamilyRef } from "./core.js";

/**
 * The five canonical stages of a W035 end-to-end case: reconstruction,
 * assessment, environment/mini-app, verification and gap closure.
 */
export const END_TO_END_STAGES = [
  "reconstruction",
  "assessment",
  "environment-mini-app",
  "verification",
  "gap-closure",
] as const;

export type EndToEndStageKey = (typeof END_TO_END_STAGES)[number];

/** One sealed stage of the provenance chain. */
export interface SealedEndToEndStage {
  readonly kind: "sealed-end-to-end-stage";
  readonly stageIndex: number;
  readonly stage: EndToEndStageKey;
  readonly summary: string;
  readonly inputs: readonly DigestRef[];
  readonly outputs: readonly DigestRef[];
  readonly evidence: readonly EvidenceRef[];
  readonly prevStageDigest: Sha256Digest | null;
  readonly stageDigest: Sha256Digest;
}

/** A full case with provenance preserved as a digest chain. */
export interface EndToEndCase {
  readonly kind: "end-to-end-case";
  readonly caseId: string;
  readonly familyRef: TaskFamilyRef;
  readonly stages: readonly SealedEndToEndStage[];
  readonly caseDigest: Sha256Digest;
}

export interface ProvenanceOk {
  readonly ok: true;
  readonly caseId: string;
  readonly caseDigest: Sha256Digest;
  readonly stageCount: number;
}

export interface ProvenanceFailure {
  readonly ok: false;
  readonly reason: string;
  readonly stageIndex: number | null;
}

export type ProvenanceVerification = ProvenanceOk | ProvenanceFailure;

/** A remaining bottleneck of the case (inputs, not derived claims). */
export interface Bottleneck {
  readonly bottleneckId: string;
  readonly description: string;
  readonly affectedStages: readonly EndToEndStageKey[];
  readonly evidence: readonly DigestRef[];
}

/** Honest limitations: remaining bottlenecks + the next constraint. */
export interface LimitationsReport {
  readonly kind: "limitations-report";
  readonly reportId: string;
  readonly caseRef: { readonly caseId: string; readonly caseDigest: Sha256Digest };
  readonly remainingBottlenecks: readonly Bottleneck[];
  readonly nextConstraint: string;
  readonly reportDigest: Sha256Digest;
}
