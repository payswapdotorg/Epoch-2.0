/**
 * W023 — Capability Discovery: public contracts.
 *
 * Every contract in this file is DATA. A discovered capability is a
 * DECLARATION with provenance, never a callable. Evidence is
 * provenance-bearing observation about problems/tasks — kind, payload
 * digest refs, source refs — and never carries world content. Model or
 * provider names never define roles.
 */

// ── Digests and identifiers ────────────────────────────────────────────────

/** Hex-encoded SHA-256 digest of a canonical serialization (plain string: serializable, provider-neutral). */
export type Digest = string;

/** Digest of an evidence payload (or of the lifecycle event that carries it). */
export type EvidenceDigest = Digest;

/** Stable identifier of a discovered capability, derived from evidence digests. */
export type CapabilityId = string;

/** Identifier of a provider-neutral capability role (never a model name). */
export type RoleId = string;

/** Identifier of a discovery rule. */
export type RuleId = string;

/** Identifier of a discovery session. */
export type SessionId = string;

// ── Evidence ────────────────────────────────────────────────────────────────

/** Provider-neutral observation vocabulary (open: hosts may add their own neutral kinds). */
export type EvidenceKind =
  | "task.completed"
  | "task.failed"
  | "task.attempted"
  | "solution.accepted"
  | "solution.rejected"
  | "revision.evaluated"
  | "interaction.observed"
  | "lifecycle.transition"
  | (string & Record<never, never>);

/** Neutral subject taxonomy (open). */
export type EvidenceSubjectKind =
  | "task"
  | "problem"
  | "solution"
  | "revision"
  | "session"
  | (string & Record<never, never>);

/** A reference to the subject an observation is about — digest refs and labels only, never world content. */
export interface EvidenceSubject {
  readonly kind: EvidenceSubjectKind;
  readonly digest?: Digest;
  readonly label?: string;
}

/** Provenance of an observation — typically the W022 lifecycle event digest that produced it. */
export interface EvidenceSourceRef {
  readonly lifecycleEventDigest?: EvidenceDigest;
  readonly revisionDigest?: Digest;
  readonly label?: string;
}

/** A provenance-bearing observation about a problem/task. Never world content. */
export interface CapabilityEvidence {
  readonly kind: EvidenceKind;
  readonly payloadDigest: EvidenceDigest;
  readonly sourceRefs: readonly EvidenceSourceRef[];
  readonly subject?: EvidenceSubject;
}

// ── Roles and capabilities ─────────────────────────────────────────────────

/** Provider-neutral capability domain (open). */
export type CapabilityDomain =
  | "construction"
  | "analysis"
  | "verification"
  | "interaction"
  | "orchestration"
  | (string & Record<never, never>);

/** A provider-neutral role declaration. Model names NEVER define roles. */
export interface CapabilityRole {
  readonly id: RoleId;
  readonly label: string;
  readonly description: string;
  readonly domain: CapabilityDomain;
}

/** What a declared capability was observed to apply to. */
export interface CapabilityScope {
  readonly appliesTo: readonly EvidenceSubjectKind[];
  readonly description?: string;
}

/** A DECLARATION with provenance — not a callable, carries no execution authority. */
export interface DiscoveredCapability {
  readonly id: CapabilityId;
  readonly roleId: RoleId;
  readonly scope: CapabilityScope;
  /** Confidence as data, in [0, 1], computed deterministically from occurrences and rule weight. */
  readonly confidence: number;
  readonly evidenceRefs: readonly EvidenceDigest[];
  readonly provenance: readonly EvidenceSourceRef[];
  /** Machine step at which the declaration was promoted (never a wall-clock timestamp). */
  readonly discoveredAtStep: number;
}

// ── Rules and policy ───────────────────────────────────────────────────────

/** Evidence pattern, as data (not behavior), that a rule matches against. */
export interface RuleMatch {
  readonly evidenceKind?: EvidenceKind;
  readonly subjectKind?: EvidenceSubjectKind;
  readonly payloadDigestIn?: readonly EvidenceDigest[];
  /** Minimum cumulative matching occurrences before this rule may promote (rule-local threshold). */
  readonly minOccurrences?: number;
}

/** The candidate capability a rule proposes when its pattern matches. */
export interface RuleCandidate {
  readonly roleId: RoleId;
  readonly scope: CapabilityScope;
}

/** An evidence pattern → candidate capability mapping, expressed entirely as data. */
export interface DiscoveryRule {
  readonly id: RuleId;
  readonly description: string;
  readonly match: RuleMatch;
  readonly candidate: RuleCandidate;
  /** Contribution weight in (0, 1] applied per matching occurrence. */
  readonly weight: number;
}

/** Promotion thresholds: when a candidate becomes an accepted declaration. */
export interface PromotionThresholds {
  readonly minEvidenceCount: number;
  readonly minConfidence: number;
  readonly maxConfidence: number;
}

/** Which rules a deployment enables, plus promotion thresholds. */
export interface DiscoveryPolicy {
  readonly rules: readonly DiscoveryRule[];
  readonly enabledRuleIds: readonly RuleId[];
  readonly promotion: PromotionThresholds;
}

// ── Outcomes ───────────────────────────────────────────────────────────────

export type RejectionReason =
  | "rule-not-enabled"
  | "duplicate"
  | "below-min-evidence"
  | "below-min-confidence";

/** A candidate that matched a rule but was not promoted, with the deterministic reason. */
export interface RejectedCandidate {
  readonly ruleId: RuleId;
  readonly capability: DiscoveredCapability;
  readonly reason: RejectionReason;
  readonly detail: string;
}

/** Deterministic outcome of one evaluation step. */
export interface DiscoveryResult {
  readonly step: number;
  readonly evidenceDigest: Digest;
  readonly matchedRuleIds: readonly RuleId[];
  readonly accepted: readonly DiscoveredCapability[];
  readonly rejected: readonly RejectedCandidate[];
}

/** Pure evaluation: the advanced state plus the outcome for this step. */
export interface DiscoveryEvaluation {
  readonly previousStateDigest: Digest;
  readonly state: DiscoveryState;
  readonly result: DiscoveryResult;
}

// ── Machine state ──────────────────────────────────────────────────────────

/** One recorded (enabled-rule) observation — digest refs only, no world content. */
export interface ObservationRecord {
  readonly step: number;
  readonly ruleId: RuleId;
  readonly ruleEnabled: boolean;
  readonly evidenceKind: EvidenceKind;
  readonly payloadDigest: EvidenceDigest;
  readonly sourceRefs: readonly EvidenceSourceRef[];
}

/** Provenance of one evaluation step. */
export interface DiscoveryHistoryEntry {
  readonly step: number;
  readonly evidenceDigest: Digest;
  readonly matchedRuleIds: readonly RuleId[];
  readonly acceptedCapabilityIds: readonly CapabilityId[];
  readonly rejectedRuleIds: readonly RuleId[];
}

/**
 * Discovery session state: monotonic step counters and digest refs ONLY —
 * no timestamps, no wall-clock values, no world content.
 */
export interface DiscoveryState {
  readonly sessionId: SessionId;
  readonly policyDigest: Digest;
  readonly step: number;
  readonly observations: readonly ObservationRecord[];
  readonly capabilities: readonly DiscoveredCapability[];
  readonly rejections: readonly RejectedCandidate[];
  readonly history: readonly DiscoveryHistoryEntry[];
}

// ── Overview projection (read-only, host-renderable) ───────────────────────

export interface RoleCount {
  readonly roleId: RoleId;
  readonly count: number;
}

export interface EvidenceKindCount {
  readonly kind: EvidenceKind;
  readonly count: number;
}

/** Read-only projection any host can render without importing machine internals. */
export interface DiscoveryOverview {
  readonly sessionId: SessionId;
  readonly step: number;
  readonly stateDigest: Digest;
  readonly policyDigest: Digest;
  readonly evidenceObserved: number;
  readonly observationCount: number;
  readonly acceptedCapabilityCount: number;
  readonly rejectedCandidateCount: number;
  readonly acceptedRoles: readonly RoleCount[];
  readonly evidenceKinds: readonly EvidenceKindCount[];
}

// ── Persistence (through the W021 WorldStore port) ─────────────────────────

/** Digest-keyed discovery snapshot persisted alongside revision lineage. */
export interface PersistedDiscoverySnapshot {
  readonly kind: "epoch.discovery-snapshot";
  readonly version: 1;
  readonly digest: Digest;
  readonly sessionId: SessionId;
  readonly policyDigest: Digest;
  readonly state: DiscoveryState;
}

/**
 * The minimal store surface discovery needs. Bind the W021 `WorldStore` port
 * to this via `bindWorldStore` (packages/epoch-persistence is consumed,
 * never re-implemented).
 */
export interface DiscoveryStorePort {
  save(snapshot: PersistedDiscoverySnapshot): void | Promise<void>;
  restore(
    digest: Digest,
  ):
    | PersistedDiscoverySnapshot
    | null
    | Promise<PersistedDiscoverySnapshot | null>;
  digests?(): readonly Digest[] | Promise<readonly Digest[]>;
}

// ── Lifecycle integration (read-only) ──────────────────────────────────────

/** Structured, provenance-bearing note a host may attach in the Learn phase. Never world content. */
export interface DiscoveryNote {
  readonly kind: "epoch.discovery-note";
  readonly version: 1;
  readonly sessionId: SessionId;
  readonly step: number;
  readonly stateDigest: Digest;
  readonly capabilityIds: readonly CapabilityId[];
  readonly roles: readonly RoleId[];
  readonly evidenceDigests: readonly EvidenceDigest[];
}

// ── Machine ────────────────────────────────────────────────────────────────

/** Pure, deterministic discovery machine. Holds only the (frozen) policy. */
export interface DiscoveryMachine {
  readonly policy: DiscoveryPolicy;
  readonly policyDigest: Digest;
  initialState(sessionId?: SessionId): DiscoveryState;
  evaluate(
    state: DiscoveryState,
    evidence: CapabilityEvidence,
  ): DiscoveryEvaluation;
  historyOf(state: DiscoveryState): readonly DiscoveryHistoryEntry[];
  overviewOf(state: DiscoveryState): DiscoveryOverview;
  stateDigestOf(state: DiscoveryState): Digest;
  evidenceDigestOf(evidence: CapabilityEvidence): Digest;
}
