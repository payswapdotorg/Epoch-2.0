import type { Sha256Digest } from "../canonical.js";
import type {
  DigestRef,
  EvidenceRef,
  LifecyclePhaseKey,
  QualityScore,
  TaskFamilyRef,
} from "./core.js";

/**
 * Completion of one task, keyed to a W022 lifecycle phase via evidence
 * references. Phase keys and evidence digests are owned by W022; this
 * record only carries them.
 */
export interface CompletionRecord {
  readonly kind: "completion-record";
  readonly recordId: string;
  readonly familyRef: TaskFamilyRef;
  readonly taskId: string;
  readonly taskClassId: string;
  readonly lifecyclePhase: LifecyclePhaseKey;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly outcome: "completed" | "incomplete";
  readonly completedAt: string;
  readonly recordDigest: Sha256Digest;
}

/** The W020 verification status attached to a quality metric. */
export type QualityMetricVerification =
  | { readonly status: "verified"; readonly batteryRecordRef: DigestRef }
  | { readonly status: "failed"; readonly batteryRecordRef: DigestRef }
  | { readonly status: "unverified"; readonly batteryRecordRef: null };

interface QualityMetricCommon {
  readonly kind: "verified-quality-metric";
  readonly metricId: string;
  readonly familyRef: TaskFamilyRef;
  readonly taskId: string;
  readonly measuredAt: string;
}

/** Verified output quality: the only variant that carries a score. */
export interface VerifiedQuality extends QualityMetricCommon {
  readonly verification: {
    readonly status: "verified";
    readonly batteryRecordRef: DigestRef;
  };
  readonly qualityScore: QualityScore;
}

/** Verification failed: no score — failed outputs never count as quality. */
export interface FailedVerification extends QualityMetricCommon {
  readonly verification: {
    readonly status: "failed";
    readonly batteryRecordRef: DigestRef;
  };
  readonly qualityScore: null;
}

/** Never verified: no score — unverified outputs never count as quality. */
export interface UnverifiedOutput extends QualityMetricCommon {
  readonly verification: {
    readonly status: "unverified";
    readonly batteryRecordRef: null;
  };
  readonly qualityScore: null;
}

/**
 * Verified output quality per W020 semantics. The typed law: only the
 * "verified" variant can carry a qualityScore; the other variants are
 * structurally incapable of counting as quality.
 */
export type VerifiedQualityMetric = VerifiedQuality | FailedVerification | UnverifiedOutput;

/** Aggregated verified-quality counts over a set of metrics. */
export interface VerifiedQualityShare {
  readonly kind: "verified-quality-share";
  readonly total: number;
  readonly verified: number;
  readonly acceptable: number;
  readonly failed: number;
  readonly unverified: number;
}
