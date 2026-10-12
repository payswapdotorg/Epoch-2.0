import { toSha256Digest } from "../canonical.js";
import type { Sha256Digest } from "../canonical.js";
import {
  namespaceValue,
  nonEmptyString,
  nonNegativeInteger,
  nonNegativeNumber,
} from "../validate.js";

/**
 * Branded primitives shared by every W035 record.
 *
 * These types carry NO semantics owned by other packages: lifecycle phase
 * keys and digest-ref namespaces are opaque strings validated for shape
 * only. The owning packages (W020/W022/W024/W031/W032/W033) remain the
 * single semantic authorities; this package only references their records
 * by digest.
 */

declare const lifecyclePhaseKeyBrand: unique symbol;

/** Opaque W022 lifecycle phase key (kebab-case; vocabulary owned by W022). */
export type LifecyclePhaseKey = string & {
  readonly [lifecyclePhaseKeyBrand]: true;
};

const LIFECYCLE_PHASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Validate and brand a W022 lifecycle phase key (shape only). */
export function lifecyclePhaseKey(value: string): LifecyclePhaseKey {
  if (typeof value !== "string" || !LIFECYCLE_PHASE_PATTERN.test(value)) {
    throw new TypeError(
      `lifecyclePhaseKey: kebab-case string expected, got: ${JSON.stringify(value)}`
    );
  }
  return value as LifecyclePhaseKey;
}

/**
 * Documented digest-ref namespaces for the frozen W020/W022/W024/W031/
 * W032/W033 records this package measures over (proposed convention —
 * confirm with the Tech Lead; any matching namespace is accepted so this
 * file never becomes a namespace authority).
 */
export const KNOWN_NAMESPACES = [
  "epoch-lifecycle:evidence",
  "epoch-verification:battery",
  "epoch-agent-tools:command",
  "epoch-agent-tools:audit",
  "epoch-capability-reproduction:record",
  "epoch-capability-learning:intervention",
  "epoch-cost-quality-search:outcome",
] as const;

export type KnownNamespace = (typeof KNOWN_NAMESPACES)[number];

/** Unvalidated digest reference as it arrives from external data. */
export interface DigestRefInput {
  readonly namespace: string;
  readonly digest: string;
}

/** Validated reference to a record owned by another package. */
export interface DigestRef {
  readonly kind: "digest-ref";
  readonly namespace: string;
  readonly digest: Sha256Digest;
}

/** Revalidate an externally supplied digest reference. */
export function normalizeDigestRef(ref: DigestRefInput): DigestRef {
  return {
    kind: "digest-ref",
    namespace: namespaceValue("digestRef.namespace", ref.namespace),
    digest: toSha256Digest(ref.digest),
  };
}

/** Construct a digest reference from raw parts. */
export function digestRef(namespace: string, digest: string): DigestRef {
  return normalizeDigestRef({ namespace, digest });
}

/** Unvalidated W022 evidence reference as it arrives from external data. */
export interface EvidenceRefInput {
  readonly lifecyclePhase: string;
  readonly evidenceKey: string;
  readonly digest: string;
}

/** Validated W022 lifecycle evidence reference. */
export interface EvidenceRef {
  readonly kind: "evidence-ref";
  readonly lifecyclePhase: LifecyclePhaseKey;
  readonly evidenceKey: string;
  readonly digest: Sha256Digest;
}

/** Revalidate an externally supplied evidence reference. */
export function normalizeEvidenceRef(ref: EvidenceRefInput): EvidenceRef {
  return {
    kind: "evidence-ref",
    lifecyclePhase: lifecyclePhaseKey(ref.lifecyclePhase),
    evidenceKey: nonEmptyString("evidenceRef.evidenceKey", ref.evidenceKey),
    digest: toSha256Digest(ref.digest),
  };
}

/** Construct a W022 evidence reference from raw parts. */
export function evidenceRef(
  lifecyclePhase: string,
  evidenceKey: string,
  digest: string
): EvidenceRef {
  return normalizeEvidenceRef({ lifecyclePhase, evidenceKey, digest });
}

/** Monetary cost in integer minor units with an ISO-4217-style code. */
export interface MonetaryCost {
  readonly kind: "monetary-cost";
  readonly currencyCode: string;
  readonly minorUnits: number;
}

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/** Construct a monetary cost. */
export function monetaryCost(
  currencyCode: string,
  minorUnits: number
): MonetaryCost {
  if (
    typeof currencyCode !== "string" ||
    !CURRENCY_CODE_PATTERN.test(currencyCode)
  ) {
    throw new TypeError(
      `monetaryCost.currencyCode: three uppercase letters expected, got: ${JSON.stringify(currencyCode)}`
    );
  }
  return {
    kind: "monetary-cost",
    currencyCode,
    minorUnits: nonNegativeInteger("monetaryCost.minorUnits", minorUnits),
  };
}

/** Revalidate an externally supplied monetary cost. */
export function normalizeMonetaryCost(cost: MonetaryCost): MonetaryCost {
  return monetaryCost(cost.currencyCode, cost.minorUnits);
}

/** Duration measured in minutes. */
export interface DurationMeasure {
  readonly kind: "duration-measure";
  readonly minutes: number;
}

/** Construct a duration measure. */
export function durationMeasure(minutes: number): DurationMeasure {
  return {
    kind: "duration-measure",
    minutes: nonNegativeNumber("durationMeasure.minutes", minutes),
  };
}

/** Revalidate an externally supplied duration measure. */
export function normalizeDurationMeasure(
  duration: DurationMeasure
): DurationMeasure {
  return durationMeasure(duration.minutes);
}

declare const qualityScoreBrand: unique symbol;

/** Output-quality score in [0, 1]; meaningful only when verified (W020). */
export type QualityScore = number & {
  readonly [qualityScoreBrand]: true;
};

/** Validate and brand a quality score. */
export function qualityScore(value: number): QualityScore {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new TypeError(
      `qualityScore: finite number in [0, 1] expected, got: ${String(value)}`
    );
  }
  return value as QualityScore;
}

/** Policy input: the minimum verified score counted as acceptable. */
export interface QualityAcceptanceThreshold {
  readonly kind: "quality-acceptance-threshold";
  readonly minimumVerifiedScore: QualityScore;
}

/** Construct a quality acceptance threshold. */
export function qualityAcceptanceThreshold(
  minimumVerifiedScore: number
): QualityAcceptanceThreshold {
  return {
    kind: "quality-acceptance-threshold",
    minimumVerifiedScore: qualityScore(minimumVerifiedScore),
  };
}

/**
 * TaskFamilyRef is defined in ./task-family.ts (family identity belongs with
 * the denominator types) and re-exported here because the sibling record
 * types (completion, measures, safety, rates, variance, end-to-end) import
 * their shared primitives from this module. Type-only and acyclic:
 * ./task-family.ts depends only on ../canonical.js.
 */
export type { TaskFamilyRef } from "./task-family.js";
