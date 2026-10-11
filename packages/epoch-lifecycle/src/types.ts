/**
 * Public lifecycle contracts (W022). Everything here is plain, deeply
 * readonly data — digests, phase ids, monotonic step counters, provenance
 * refs. No timestamps, no world content, no behavior.
 *
 * DigestRef references a digest computed by an authoritative package (the
 * world model or W021 persistence). The lifecycle never computes world
 * digests itself — it references them.
 */

import type { LifecyclePhaseId } from "./phases.ts";

/** Digest computed by an authoritative package; referenced, never computed here. */
export type DigestRef = string;

/** Digest of this package's own canonical LifecycleState serialization. */
export type LifecycleStateDigest = string;

/** What a lifecycle may be attached to — always by digest, never by mutable pointer. */
export const LIFECYCLE_ANCHOR_KINDS = ["solution", "revision", "surface"] as const;

export type LifecycleAnchorKind = (typeof LIFECYCLE_ANCHOR_KINDS)[number];

export function isLifecycleAnchorKind(value: unknown): value is LifecycleAnchorKind {
  return typeof value === "string" && LIFECYCLE_ANCHOR_KINDS.includes(value as LifecycleAnchorKind);
}

/** Digest-based identity of the artifact a lifecycle organizes. Never a mutable pointer. */
export interface LifecycleAnchor {
  readonly kind: LifecycleAnchorKind;
  readonly digest: DigestRef;
}

/** A phase-to-phase move: evidence-keyed, monotonic, timestamp-free. */
export interface LifecycleTransition {
  readonly from: LifecyclePhaseId;
  readonly to: LifecyclePhaseId;
  readonly step: number;
  readonly reason: string;
  readonly evidence: readonly DigestRef[];
}

/** Observable occurrence kinds inside a phase. */
export const LIFECYCLE_EVENT_KINDS = [
  "observation",
  "decision",
  "plan-item",
  "acquisition",
  "verification-result",
  "forecast",
  "learning-note",
] as const;

export type LifecycleEventKind = (typeof LIFECYCLE_EVENT_KINDS)[number];

export function isLifecycleEventKind(value: unknown): value is LifecycleEventKind {
  return typeof value === "string" && LIFECYCLE_EVENT_KINDS.includes(value as LifecycleEventKind);
}

/** Structured outcome of a planned-vs-actual comparison. */
export type LearningOutcome = "as-planned" | "deviation";

export function isLearningOutcome(value: unknown): value is LearningOutcome {
  return value === "as-planned" || value === "deviation";
}

/** What a learning note records: planned vs actual, keyed by digests. */
export interface LearningNotePayload {
  readonly plannedDigest: DigestRef;
  readonly actualDigest: DigestRef;
  readonly outcome: LearningOutcome;
}

/**
 * An observable occurrence inside a phase — observation, decision, plan-item,
 * acquisition, verification result, forecast, learning note. Carries
 * provenance refs and evidence digests; never mutates world content.
 */
export interface LifecycleEvent {
  readonly kind: LifecycleEventKind;
  readonly phase: LifecyclePhaseId;
  readonly step: number;
  readonly note: string;
  readonly subject: LifecycleAnchor | null;
  readonly provenance: readonly string[];
  readonly evidence: readonly DigestRef[];
  readonly learning: LearningNotePayload | null;
}

/**
 * Which phase a solution is in, when (by step counter) it entered, and the
 * evidence that moved it. Identical operation sequences yield byte-identical
 * canonical serializations and identical digests.
 */
export interface LifecycleState {
  readonly anchor: LifecycleAnchor;
  readonly policyId: string;
  readonly phase: LifecyclePhaseId;
  readonly step: number;
  readonly enteredPhaseAtStep: number;
  readonly transitions: readonly LifecycleTransition[];
  readonly events: readonly LifecycleEvent[];
}

/** Caller-facing transition request; the machine stamps `from` and `step`. */
export interface LifecycleTransitionRequest {
  readonly to: LifecyclePhaseId;
  readonly reason: string;
  readonly evidence: readonly DigestRef[];
}

/** Caller-facing event request; the machine stamps `phase` and `step`. */
export interface LifecycleEventRequest {
  readonly kind: LifecycleEventKind;
  readonly note: string;
  readonly subject?: LifecycleAnchor | null;
  readonly provenance: readonly string[];
  readonly evidence: readonly DigestRef[];
  readonly learning?: LearningNotePayload | null;
}

/** Input for the Learn phase's structured notes. */
export interface LearningNoteInput {
  readonly note: string;
  readonly plannedDigest: DigestRef;
  readonly actualDigest: DigestRef;
  readonly outcome: LearningOutcome;
  readonly provenance: readonly string[];
  readonly evidence: readonly DigestRef[];
  readonly subject?: LifecycleAnchor | null;
}

/** Derived learning output: a pure projection over recorded notes. Never trained, never a model call. */
export interface DerivedLearning {
  readonly step: number;
  readonly note: string;
  readonly plannedDigest: DigestRef;
  readonly actualDigest: DigestRef;
  readonly outcome: LearningOutcome;
  readonly evidence: readonly DigestRef[];
}

/** How a policy classifies an allowed phase-to-phase edge. */
export type LifecycleEdgeKind = "forward" | "rework";

/** One allowed phase-to-phase move inside a LifecyclePolicy. */
export interface LifecycleEdge {
  readonly from: LifecyclePhaseId;
  readonly to: LifecyclePhaseId;
  readonly kind: LifecycleEdgeKind;
}

/** Which transitions a deployment allows. Policies are data, never behavior. */
export interface LifecyclePolicy {
  readonly id: string;
  readonly edges: readonly LifecycleEdge[];
}

/** Per-phase rollup inside the read-only lifecycle projection. */
export interface LifecyclePhaseSummary {
  readonly id: LifecyclePhaseId;
  readonly name: string;
  readonly status: "current" | "visited" | "pending";
  readonly visits: number;
  readonly eventCount: number;
  readonly evidenceCount: number;
  readonly enteredAtStep: number | null;
  readonly exitedAtStep: number | null;
}

/** Read-only projection sufficient for any host to render a lifecycle view without importing machine internals. */
export interface LifecycleOverview {
  readonly anchor: LifecycleAnchor;
  readonly policyId: string;
  readonly currentPhase: LifecyclePhaseId;
  readonly currentPhaseName: string;
  readonly step: number;
  readonly transitionCount: number;
  readonly eventCount: number;
  readonly reworkCount: number;
  readonly visitedPhaseCount: number;
  readonly evidenceDigests: readonly string[];
  readonly learningNoteCount: number;
  readonly learningAsPlanned: number;
  readonly learningDeviations: number;
  readonly phases: readonly LifecyclePhaseSummary[];
}

/** Envelope describing one persisted lifecycle snapshot, keyed by state digest. */
export interface LifecycleSnapshot {
  readonly format: string;
  readonly stateDigest: LifecycleStateDigest;
  readonly canonicalBytes: string;
  readonly anchorKind: LifecycleAnchorKind;
  readonly anchorDigest: DigestRef;
  readonly policyId: string;
  readonly phase: LifecyclePhaseId;
  readonly step: number;
}

/** The digest-addressed store surface bindWorldStore derives from a WorldStore port. */
export interface LifecycleSnapshotStore {
  put(key: string, bytes: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

/** The pure, deterministic lifecycle machine (implemented in machine.ts). */
export interface LifecycleMachine {
  readonly policy: LifecyclePolicy;
  open(anchor: LifecycleAnchor): LifecycleState;
  apply(state: LifecycleState, transition: LifecycleTransition): LifecycleState;
  advance(state: LifecycleState, request: LifecycleTransitionRequest): LifecycleState;
  record(state: LifecycleState, request: LifecycleEventRequest): LifecycleState;
  phaseOf(state: LifecycleState): LifecyclePhaseId;
  historyOf(state: LifecycleState): readonly LifecycleTransition[];
  eventsOf(state: LifecycleState): readonly LifecycleEvent[];
  overviewOf(state: LifecycleState): LifecycleOverview;
}

/** Honest environment limits, declared as literal data. */
export interface LifecycleEnvironmentConstraints {
  readonly timestamps: false;
  readonly wallClock: false;
  readonly randomness: false;
  readonly network: false;
  readonly filesystem: false;
  readonly worldWrites: false;
  readonly modelCalls: false;
  readonly training: false;
}

/** Package descriptor following the W028/W009 descriptor/module/index pattern. */
export interface LifecyclePackageDescriptor {
  readonly name: string;
  readonly workOrder: string;
  readonly phaseOrder: readonly LifecyclePhaseId[];
  readonly defaultPolicyId: string;
  readonly snapshotFormat: string;
  readonly constraints: LifecycleEnvironmentConstraints;
}
