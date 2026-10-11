/**
 * Contract home for @zcode/epoch-environment-activity (W029).
 *
 * The public data-contract types and contract constants of this package are
 * declared here (W011/W012/W018/W023 contract.ts precedent). The modules
 * that previously declared them re-export this file, so the public surface
 * through index.ts is unchanged. Construction, validation and decision
 * logic stays in the domain modules; builder/input shapes stay next to
 * their constructors. This file declares types and constants only.
 */

import type { CanonicalValue } from "./canonical.js";

// ---------------------------------------------------------------------------
// Typed event core (moved from events.ts)
// ---------------------------------------------------------------------------

/** Who initiated an event: a human, an agent, or the application itself. */
export type Initiator = "human" | "agent" | "application";
export const INITIATORS: readonly Initiator[] = [
  "human",
  "agent",
  "application",
];

/** Session identity: (sessionId, environmentId). */
export interface SessionRef {
  readonly sessionId: string;
  readonly environmentId: string;
}

/** Event kind discriminator (dotted names by convention). */
export type EventKind = string;

/** Well-known event kinds; hosts may define their own kinds. */
export const WELL_KNOWN_EVENT_KINDS = {
  sessionOpened: "session.opened",
  sessionClosed: "session.closed",
  pointerInput: "input.pointer",
  keyInput: "input.key",
  commandInvoked: "command.invoked",
  toolApplied: "tool.applied",
  toolCanceled: "tool.canceled",
  documentSaved: "document.saved",
  worldRevisionCommitted: "world.revision.committed",
  viewChanged: "view.changed",
  selectionChanged: "selection.changed",
  agentMessage: "agent.message",
  noteComposed: "note.composed",
} as const;

/** Per-event capture quality; whole unobserved spans are gap markers. */
export type EventCaptureQuality = "observed" | "partial";
export const EVENT_CAPTURE_QUALITIES: readonly EventCaptureQuality[] = [
  "observed",
  "partial",
];

/** Opaque digest reference to a foreign supporting artifact. */
export interface EvidenceReference {
  readonly digest: string;
  readonly label: string | null;
  readonly role: string | null;
}

/** Optional-fields form of EvidenceReference. */
export interface EvidenceSeed {
  readonly digest: string;
  readonly label?: string | null;
  readonly role?: string | null;
}

/** Role a correlated revision/artifact plays for an event. */
export type CorrelationRole =
  | "state-before"
  | "state-after"
  | "result"
  | "input";
export const CORRELATION_ROLES: readonly CorrelationRole[] = [
  "state-before",
  "state-after",
  "result",
  "input",
];

/** Kind of entity a correlation digest refers to. */
export type CorrelationKind =
  | "world-revision"
  | "document-revision"
  | "artifact";
export const CORRELATION_KINDS: readonly CorrelationKind[] = [
  "world-revision",
  "document-revision",
  "artifact",
];

/**
 * State/result correlation: a digest REFERENCE to a world/document revision.
 * Reference only — this package never writes the referenced entity.
 */
export interface StateCorrelation {
  readonly role: CorrelationRole;
  readonly kind: CorrelationKind;
  readonly digest: string;
  readonly label: string | null;
}

/** Optional-fields form of StateCorrelation. */
export interface CorrelationSeed {
  readonly role: CorrelationRole;
  readonly kind: CorrelationKind;
  readonly digest: string;
  readonly label?: string | null;
}

/** Typed, sequenced activity record. Ordering is by sequence, never time. */
export interface EnvironmentEvent {
  readonly type: "environment-event";
  readonly session: SessionRef;
  /**
   * 1-based, dense per session across recorded events AND redaction/gap
   * markers. Sequence numbers are the ONLY ordering primitive.
   */
  readonly sequence: number;
  readonly kind: EventKind;
  readonly initiator: Initiator;
  readonly payload: CanonicalValue;
  readonly captureQuality: EventCaptureQuality;
  readonly evidence: readonly EvidenceReference[];
  readonly correlations: readonly StateCorrelation[];
}

// ---------------------------------------------------------------------------
// Coverage, gaps and redaction (moved from coverage.ts)
// ---------------------------------------------------------------------------

/** Derived coverage classification of a record span. */
export type CoverageKind = "observed" | "partial" | "unobserved";
export const COVERAGE_KINDS: readonly CoverageKind[] = [
  "observed",
  "partial",
  "unobserved",
];

/** A contiguous span of one coverage kind (sequences inclusive). */
export interface CoverageWindow {
  readonly kind: CoverageKind;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly note: string | null;
}

/** Why content was withheld. The fact is recorded, never the content. */
export type RedactionReason =
  | "sensitive-window"
  | "policy-exclusion"
  | "retroactive";
export const REDACTION_REASONS: readonly RedactionReason[] = [
  "sensitive-window",
  "policy-exclusion",
  "retroactive",
];

/** Occupies a sequence number; records THAT something was withheld, and why. */
export interface RedactionMarker {
  readonly type: "redaction-marker";
  readonly session: SessionRef;
  readonly sequence: number;
  readonly reason: RedactionReason;
  readonly note: string | null;
}

/** Why a span of activity was not captured. */
export type GapReason =
  | "capture-paused"
  | "capture-resumed"
  | "source-unavailable"
  | "missed-events"
  | "unknown";
export const GAP_REASONS: readonly GapReason[] = [
  "capture-paused",
  "capture-resumed",
  "source-unavailable",
  "missed-events",
  "unknown",
];

/** Occupies a sequence number; documents a window that was not captured. */
export interface GapMarker {
  readonly type: "gap-marker";
  readonly session: SessionRef;
  readonly sequence: number;
  readonly reason: GapReason;
  readonly estimatedMissed: number | null;
  readonly note: string | null;
}

/** Dense per-session stream: events, redaction markers, gap markers. */
export type JournalRecord = EnvironmentEvent | RedactionMarker | GapMarker;

/** Inclusive sequence range. */
export interface SequenceRange {
  readonly fromSequence: number;
  readonly toSequence: number;
}

/** Record-kind totals of a session stream. */
export interface CoverageCounts {
  readonly events: number;
  readonly redactionMarkers: number;
  readonly gapMarkers: number;
  readonly observedWindows: number;
  readonly partialWindows: number;
  readonly unobservedWindows: number;
}

/** Derived coverage summary of a session record stream. */
export interface SessionCoverageSummary {
  /** True ONLY when the stream is non-empty and entirely observed. */
  readonly complete: boolean;
  readonly windows: readonly CoverageWindow[];
  readonly counts: CoverageCounts;
}

// ---------------------------------------------------------------------------
// Consent and privacy (moved from policy.ts)
// ---------------------------------------------------------------------------

/** What a policy allows to be captured. Exclusions always win. */
export interface CaptureScope {
  readonly includedEventKinds: readonly string[];
  readonly excludedEventKinds: readonly string[];
  readonly includedInitiators: readonly Initiator[];
}

export type ConsentState = "granted" | "withdrawn" | "never-granted";
export const CONSENT_STATES: readonly ConsentState[] = [
  "granted",
  "withdrawn",
  "never-granted",
];

/** Consent state of one subject (time-free; externalRef anchors evidence). */
export interface ConsentRecord {
  readonly consentId: string;
  readonly subject: string;
  readonly state: ConsentState;
  readonly externalRef: string | null;
  readonly note: string | null;
}

/** Permission to RETAIN captured activity at all. */
export interface RetentionPermission {
  readonly allowed: boolean;
  readonly note: string | null;
}

/** Permission to REUSE captured activity (independent of retention). */
export interface ReusePermission {
  readonly allowed: boolean;
  /** Projects in which reuse is permitted; "*" means any project. */
  readonly projects: readonly string[];
  readonly note: string | null;
}

/**
 * Per-source scope/consent record. RETENTION AND REUSE ARE SEPARATE
 * PERMISSIONS: neither is derivable from the other.
 */
export interface CapturePolicy {
  readonly type: "capture-policy";
  readonly policyId: string;
  readonly subject: string;
  /** null means the policy applies in any environment. */
  readonly environmentId: string | null;
  readonly scope: CaptureScope;
  readonly consent: ConsentRecord;
  readonly retention: RetentionPermission;
  readonly reuse: ReusePermission;
}

/** Why a scope decision came out as it did. */
export type ScopeDecisionReason =
  | "in-scope"
  | "excluded-kind"
  | "kind-not-included"
  | "initiator-not-included";

export interface ScopeDecision {
  readonly capturable: boolean;
  readonly reason: ScopeDecisionReason;
}

/** Why a capture decision came out as it did. */
export type CaptureDecisionReason =
  | "granted-in-scope"
  | "consent-not-granted"
  | "no-applicable-policy"
  | "excluded-kind"
  | "kind-not-included";

export interface CaptureDecision {
  readonly recordable: boolean;
  readonly reason: CaptureDecisionReason;
  readonly authorizingPolicy: CapturePolicy | null;
}

// ---------------------------------------------------------------------------
// Demonstration shape (moved from demonstrations.ts)
// ---------------------------------------------------------------------------

/** One narrative step of a demonstration (curated, human-authored). */
export interface NarrativeStep {
  readonly stepId: string;
  readonly ordinal: number;
  readonly description: string;
  readonly episodeId: string | null;
  readonly sequence: number | null;
}

/** What the demonstration covers AND what it explicitly does not. */
export interface DemonstrationBoundary {
  readonly covers: readonly string[];
  readonly doesNotCover: readonly string[];
  readonly openQuestions: readonly string[];
}

/** Per-episode coverage status entry inside a demonstration. */
export interface EpisodeCoverageEntry {
  readonly episodeId: string;
  readonly status: "complete-subsequence" | "partial";
}

/** Derived coverage of a demonstration across its episodes. */
export interface DemonstrationCoverage {
  readonly status: "complete" | "incomplete";
  readonly episodes: readonly EpisodeCoverageEntry[];
  readonly partialEpisodeIds: readonly string[];
  readonly reasons: readonly string[];
  readonly note: string | null;
}
