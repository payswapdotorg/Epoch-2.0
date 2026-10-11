/**
 * W025 — Human Expert Escalation: provider-neutral contracts.
 *
 * Laws honored here:
 *  - Expert data is PROVENANCE-BEARING INPUT: it records who answered, via
 *    which provider, when, and with what confidence. It is never world
 *    content and never a second world authority.
 *  - No identity assumptions: an expert is a provider-scoped opaque handle
 *    plus expertise tags plus provenance. Nothing else is required or stored.
 *  - No timestamps inside escalation state: `step`/`serial` are monotonic
 *    counters; all "when" data lives in response provenance supplied from
 *    outside the machine.
 */

/** Opaque, machine-assigned request identifier (deterministic, serial-based). */
export type RequestId = string;

/** Provider-neutral expertise tag (e.g. 'ifc', 'construction', 'gltf'). */
export type ExpertiseTag = string;

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const ESCALATION_QUESTION_KINDS = [
  "factual",
  "interpretive",
  "procedural",
  "advisory",
] as const;
export type EscalationQuestionKind = (typeof ESCALATION_QUESTION_KINDS)[number];

/** Reference to evidence by content digest (never by mutable pointer). */
export interface EvidenceRef {
  readonly digest: string;
  readonly label?: string;
}

/** Reference to a context snapshot by content digest. */
export interface ContextSnapshotRef {
  readonly digest: string;
  readonly label?: string;
}

/** What the system could not resolve on its own. */
export interface EscalationQuestion {
  readonly kind: EscalationQuestionKind;
  readonly body: string;
  readonly evidence: readonly EvidenceRef[];
  readonly contextSnapshots: readonly ContextSnapshotRef[];
  readonly requestedExpertise: readonly ExpertiseTag[];
}

/** Provider-scoped provenance for an expert descriptor. NO identity assumptions. */
export interface ExpertProvenance {
  readonly providerId: string;
  readonly expertKey: string;
  readonly declaredExpertise?: readonly ExpertiseTag[];
}

/** Provider-neutral expert descriptor: expertise tags + provenance, nothing else. */
export interface ExpertProfile {
  readonly expertise: readonly ExpertiseTag[];
  readonly provenance: ExpertProvenance;
}

/**
 * How and when an answer arrived. `answeredAt` is an opaque external clock
 * reading supplied by the adapter; the machine never generates time itself.
 */
export interface AnswerProvenance {
  readonly providerId: string;
  readonly channel: string;
  readonly answeredAt: string;
}

/** An expert answer with full provenance. Provenance-bearing input, never world content. */
export interface ExpertResponse {
  readonly requestId: RequestId;
  readonly answer: string;
  readonly confidence: ConfidenceLevel;
  readonly answeredBy: ExpertProfile;
  readonly answeredVia: AnswerProvenance;
}

/** The recorded escalation request (what the system could not resolve). */
export interface EscalationRequest {
  readonly id: RequestId;
  /** The question kind, mirrored from `question.kind` for direct access. */
  readonly kind: EscalationQuestionKind;
  readonly question: EscalationQuestion;
  readonly serial: number;
  readonly openedAtStep: number;
}

/** Rate limits expressed as data (step-based; state carries no wall clock). */
export interface EscalationRateLimits {
  readonly maxOpenRequests: number;
  readonly maxNewRequestsPerStep: number;
}

/** When escalation is allowed: thresholds, question kinds, rate limits — all data. */
export interface EscalationPolicy {
  readonly allowedQuestionKinds: readonly EscalationQuestionKind[];
  readonly minEvidenceRefs: number;
  readonly minContextSnapshots: number;
  readonly minRequestedExpertiseTags: number;
  readonly minQuestionBodyChars: number;
  readonly maxQuestionBodyChars: number;
  readonly minConfidence: ConfidenceLevel;
  readonly requireExpertiseOverlap: boolean;
  /** Open requests at least this many steps old are swept to 'expired'. 0 = never. */
  readonly expirySteps: number;
  readonly rateLimits: EscalationRateLimits;
}

export type EscalationRejectionReason =
  | "unknown-request"
  | "request-not-open"
  | "confidence-below-threshold"
  | "expertise-mismatch";

export type EscalationOutcome =
  | {
      readonly kind: "accepted";
      readonly requestId: RequestId;
      readonly response: ExpertResponse;
    }
  | {
      readonly kind: "rejected";
      readonly requestId: RequestId;
      readonly reason: EscalationRejectionReason;
    }
  | {
      readonly kind: "expired";
      readonly requestId: RequestId;
      readonly expiredAtStep: number;
    };

export const ESCALATION_REQUEST_STATUSES = [
  "open",
  "resolved",
  "expired",
] as const;
export type EscalationRequestStatus =
  (typeof ESCALATION_REQUEST_STATUSES)[number];

/** Stored record for one escalation request. */
export interface EscalatedRequestRecord {
  readonly request: EscalationRequest;
  readonly status: EscalationRequestStatus;
  readonly acceptedResponse?: ExpertResponse;
  readonly rejectionCount: number;
  readonly resolvedAtStep?: number;
  readonly expiredAtStep?: number;
}

/**
 * Pure, deterministic escalation state. NO timestamps inside state: `step` and
 * `serial` are monotonic counters; all "when" data lives in response
 * provenance supplied from outside. `parentDigest` chains every transition to
 * its predecessor's digest (digest-keyed audit chain).
 */
export interface EscalationState {
  readonly policy: EscalationPolicy;
  readonly policyDigest: string;
  readonly step: number;
  readonly serial: number;
  readonly requests: Readonly<Record<RequestId, EscalatedRequestRecord>>;
  readonly parentDigest?: string;
}

export interface EscalationHistoryEntry {
  readonly request: EscalationRequest;
  readonly status: EscalationRequestStatus;
  readonly acceptedResponse?: ExpertResponse;
  readonly rejectionCount: number;
}
