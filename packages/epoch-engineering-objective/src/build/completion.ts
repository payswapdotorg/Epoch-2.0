import { digestCanonical } from "../canonical.js";
import { isoTimestamp, kebabId } from "../validate.js";
import {
  lifecyclePhaseKey,
  normalizeDigestRef,
  normalizeEvidenceRef,
  qualityScore,
} from "../types/core.js";
import type {
  DigestRefInput,
  EvidenceRefInput,
  QualityAcceptanceThreshold,
  QualityScore,
} from "../types/core.js";
import type {
  CompletionRecord,
  FailedVerification,
  UnverifiedOutput,
  VerifiedQuality,
  VerifiedQualityMetric,
  VerifiedQualityShare,
} from "../types/completion.js";
import { normalizeFamilyRefInput } from "./denominators.js";
import type { FamilyRefInput } from "./denominators.js";

export interface CompletionRecordInput {
  readonly recordId: string;
  readonly familyRef: FamilyRefInput;
  readonly taskId: string;
  readonly taskClassId: string;
  readonly lifecyclePhase: string;
  readonly evidenceRefs: readonly EvidenceRefInput[];
  readonly outcome: "completed" | "incomplete";
  readonly completedAt: string;
}

/** Build a lifecycle-phase-keyed completion record (W035 item 2). */
export function completionRecord(input: CompletionRecordInput): CompletionRecord {
  const evidenceRefs = input.evidenceRefs.map((ref) => normalizeEvidenceRef(ref));
  if (evidenceRefs.length === 0) {
    throw new TypeError(
      "completionRecord: at least one W022 evidence ref is required (records are lifecycle-phase-keyed)",
    );
  }
  if (input.outcome !== "completed" && input.outcome !== "incomplete") {
    throw new TypeError(
      `completionRecord.outcome: 'completed' | 'incomplete' expected, got: ${JSON.stringify(input.outcome)}`,
    );
  }
  const record: Omit<CompletionRecord, "recordDigest"> = {
    kind: "completion-record",
    recordId: kebabId("completionRecord.recordId", input.recordId),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    taskId: kebabId("completionRecord.taskId", input.taskId),
    taskClassId: kebabId("completionRecord.taskClassId", input.taskClassId),
    lifecyclePhase: lifecyclePhaseKey(input.lifecyclePhase),
    evidenceRefs,
    outcome: input.outcome,
    completedAt: isoTimestamp("completionRecord.completedAt", input.completedAt),
  };
  return { ...record, recordDigest: digestCanonical(record) };
}

export interface QualityMetricInput {
  readonly metricId: string;
  readonly familyRef: FamilyRefInput;
  readonly taskId: string;
  readonly measuredAt: string;
  readonly verification:
    | {
        readonly status: "verified";
        readonly batteryRecordRef: DigestRefInput;
        readonly qualityScore: number;
      }
    | { readonly status: "failed"; readonly batteryRecordRef: DigestRefInput }
    | { readonly status: "unverified" };
}

/**
 * Build a verified-quality metric per W020 semantics. The typed law: only
 * the "verified" variant can carry a qualityScore; failed and unverified
 * outputs are structurally scoreless.
 */
export function qualityMetric(input: QualityMetricInput): VerifiedQualityMetric {
  const common: Omit<VerifiedQuality, "verification" | "qualityScore"> = {
    kind: "verified-quality-metric",
    metricId: kebabId("qualityMetric.metricId", input.metricId),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    taskId: kebabId("qualityMetric.taskId", input.taskId),
    measuredAt: isoTimestamp("qualityMetric.measuredAt", input.measuredAt),
  };
  const v = input.verification;
  if (v === null || typeof v !== "object" || typeof v.status !== "string") {
    throw new TypeError("qualityMetric.verification: verification object expected");
  }
  switch (v.status) {
    case "verified":
      return {
        ...common,
        verification: {
          status: "verified",
          batteryRecordRef: normalizeDigestRef(v.batteryRecordRef),
        },
        qualityScore: qualityScore(v.qualityScore),
      };
    case "failed":
      return {
        ...common,
        verification: {
          status: "failed",
          batteryRecordRef: normalizeDigestRef(v.batteryRecordRef),
        },
        qualityScore: null,
      };
    case "unverified":
      return {
        ...common,
        verification: { status: "unverified", batteryRecordRef: null },
        qualityScore: null,
      };
    default:
      // NOTE: `v` is narrowed to `never` here (all union statuses are
      // covered above), so the message reads the un-narrowed input instead.
      throw new TypeError(
        `qualityMetric.verification.status: 'verified' | 'failed' | 'unverified' expected, got: ${JSON.stringify(input.verification)}`,
      );
  }
}

/**
 * The typed quality law: a score exists ONLY for verified outputs.
 * Unverified and failed outputs never count as quality.
 */
export function effectiveQualityScore(metric: VerifiedQualityMetric): QualityScore | null {
  return metric.verification.status === "verified" ? metric.qualityScore : null;
}

/** Verified AND at or above the acceptance threshold. */
export function isVerifiedQualityAcceptable(
  metric: VerifiedQualityMetric,
  acceptance: QualityAcceptanceThreshold,
): boolean {
  const score = effectiveQualityScore(metric);
  return score !== null && score >= acceptance.minimumVerifiedScore;
}

/** Aggregate verified-quality counts over a set of metrics. */
export function verifiedQualityShare(
  metrics: readonly VerifiedQualityMetric[],
  acceptance: QualityAcceptanceThreshold,
): VerifiedQualityShare {
  let verified = 0;
  let acceptable = 0;
  let failed = 0;
  let unverified = 0;
  for (const metric of metrics) {
    // Read the verification union through a local so counting relies only on
    // direct (one-level) discriminant checks, never on narrowing `metric`.
    const verification = metric.verification;
    if (verification.status === "verified") {
      verified += 1;
      const score = metric.qualityScore;
      if (score !== null && score >= acceptance.minimumVerifiedScore) {
        acceptable += 1;
      }
    } else if (verification.status === "failed") {
      failed += 1;
    } else if (verification.status === "unverified") {
      unverified += 1;
    } else {
      throw new TypeError(
        `verifiedQualityShare: unknown verification status, got: ${JSON.stringify(verification)}`,
      );
    }
  }
  return {
    kind: "verified-quality-share",
    total: metrics.length,
    verified,
    acceptable,
    failed,
    unverified,
  };
}

export type { FailedVerification, UnverifiedOutput };
