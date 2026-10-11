/**
 * @zcode/epoch-lifecycle — the universal engineering lifecycle (W022).
 *
 * Understand → Decide → Plan → Acquire → Realize → Observe/Actualize →
 * Verify → Forecast → Close → Learn.
 *
 * ARCHITECTURE-LOCK invariants honored here:
 * - (1, 4) the world model is the single semantic authority. This package
 *   organizes engineering work AROUND that authority; it never derives,
 *   repairs or stores world content. World revisions are referenced by digest.
 * - (17) determinism: identical operation sequences produce byte-identical
 *   canonical serializations and identical digests. State carries NO
 *   timestamps — a single monotonic step counter and digest references.
 *
 * This entrypoint defines every public lifecycle contract and the pure,
 * deterministic LifecycleMachine. Illegal transitions raise typed
 * LifecycleError values; they are never silently corrected.
 */

import { appendEvent } from "./events.ts";
import { LifecycleError } from "./errors.ts";
import { isLifecyclePhaseId } from "./phases.ts";
import { DEFAULT_LIFECYCLE_POLICY, findEdge, validateLifecyclePolicy } from "./policy.ts";
import { assertAnchor, assertStateShape, assertTransitionShape, deepFreeze, isNonEmptyString } from "./validate.ts";
import { projectLifecycleOverview } from "./overview.ts";

/* ------------------------------------------------------------------ *
 * Public contracts (data only — no behavior, no timestamps)
 * ------------------------------------------------------------------ */

/** The ten canonical phases of the universal engineering lifecycle. */
export type LifecyclePhaseId =
  | "understand"
  | "decide"
  | "plan"
  | "acquire"
  | "realize"
  | "observe"
  | "verify"
  | "forecast"
  | "close"
  | "learn";

/** A phase described as data: identity plus entry/exit criteria, never behavior. */
export interface LifecyclePhaseDefinition {
  readonly id: LifecyclePhaseId;
  readonly name: string;
  readonly entryCriteria: readonly string[];
  readonly exitCriteria: readonly string[];
}

/**
 * Digest computed by an authoritative package (the world model or W021
 * persistence). The lifecycle never computes world digests itself — it only
 * references them.
 */
export type DigestRef = string;

/** Digest of this package's own canonical LifecycleState serialization. */
export type LifecycleStateDigest = string;

/** What a lifecycle may be attached to: a solution, a revision or a surface — always by digest. */
export type LifecycleAnchorKind = "solution" | "revision" | "surface";

/** Digest-based identity of the artifact a lifecycle organizes. Never a mutable pointer. */
export interface LifecycleAnchor {
  readonly kind: LifecycleAnchorKind;
  readonly digest: DigestRef;
}

/** How a policy classifies an allowed phase-to-phase edge. */
export type LifecycleEdgeKind = "forward" | "rework";

/** One allowed phase-to-phase move inside a LifecyclePolicy. */
export interface LifecycleEdge {
  readonly from: LifecyclePhaseId;
  readonly to: LifecyclePhaseId;
  readonly kind: LifecycleEdgeKind;
}

/**
 * Which transitions a deployment allows. The default policy allows the
 * standard forward chain plus the explicit rework loops Verify→Understand
 * and Observe→Plan.
 */
export interface LifecyclePolicy {
  readonly id: string;
  readonly edges: readonly LifecycleEdge[];
}

/** A validated phase-to-phase move: evidence-keyed, monotonic, timestamp-free. */
export interface LifecycleTransition {
  readonly from: LifecyclePhaseId;
  readonly to: LifecyclePhaseId;
  readonly step: number;
  readonly reason: string;
  readonly evidence: readonly DigestRef[];
}

/**
 * An observable occurrence inside a phase — observation, decision, plan-item,
 * acquisition, verification result, forecast, learning note. Carries
 * provenance refs and evidence digests; never mutates world content.
 */
export type LifecycleEventKind =
  | "observation"
  | "decision"
  | "plan-item"
  | "acquisition"
  | "verification-result"
  | "forecast"
  | "learning-note";

/** Structured outcome of a planned-vs-actual comparison. */
export type LearningOutcome = "as-planned" | "deviation";

/** What a learning note records: planned vs actual, keyed by digests. */
export interface LearningNotePayload {
  readonly plannedDigest: DigestRef;
  readonly actualDigest: DigestRef;
  readonly outcome: LearningOutcome;
}

/** An immutable occurrence recorded inside a phase. */
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

/** Derived learning output: a projection over recorded notes. Honest data — never trained, never a model call. */
export interface DerivedLearning {
  readonly step: number;
  readonly note: string;
  readonly plannedDigest: DigestRef;
  readonly actualDigest: DigestRef;
  readonly outcome: LearningOutcome;
  readonly evidence: readonly DigestRef[];
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

/**
 * Read-only projection sufficient for any host to render a lifecycle view
 * without importing machine internals.
 */
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

/** Envelope persisted THROUGH the W021 WorldStore port, keyed by the state digest. */
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

/**
 * The minimal digest-addressed port that bindWorldStore derives from a
 * WorldStore. Storage itself is never re-implemented by this package.
 */
export interface LifecycleSnapshotStore {
  put(key: string, bytes: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

/* ------------------------------------------------------------------ *
 * The state machine (pure, deterministic)
 * ------------------------------------------------------------------ */

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

function openState(policy: LifecyclePolicy, anchor: LifecycleAnchor): LifecycleState {
  assertAnchor(anchor);
  return deepFreeze({
    anchor: { kind: anchor.kind, digest: anchor.digest },
    policyId: policy.id,
    phase: "understand",
    step: 0,
    enteredPhaseAtStep: 0,
    transitions: [],
    events: [],
  });
}

function applyTransition(policy: LifecyclePolicy, state: LifecycleState, transition: LifecycleTransition): LifecycleState {
  assertStateShape(state);
  if (state.policyId !== policy.id) {
    throw new LifecycleError(
      "policy-mismatch",
      `state is governed by policy "${state.policyId}" but this machine enforces "${policy.id}"`,
      { statePolicyId: state.policyId, machinePolicyId: policy.id },
    );
  }
  assertTransitionShape(transition);
  if (transition.from !== state.phase) {
    throw new LifecycleError(
      "phase-mismatch",
      `transition starts in "${transition.from}" but the solution is in "${state.phase}"`,
      { from: transition.from, to: transition.to, activePhase: state.phase },
    );
  }
  if (transition.step !== state.step + 1) {
    throw new LifecycleError(
      "step-mismatch",
      `transition step ${transition.step} does not continue state step ${state.step}`,
      { transitionStep: transition.step, stateStep: state.step },
    );
  }
  if (!isNonEmptyString(transition.reason)) {
    throw new LifecycleError("missing-reason", "a transition requires a non-empty reason", { step: transition.step });
  }
  if (transition.evidence.length === 0) {
    throw new LifecycleError("missing-evidence", "a transition requires at least one evidence digest", {
      step: transition.step,
    });
  }
  if (!transition.evidence.every((digest) => isNonEmptyString(digest))) {
    throw new LifecycleError("invalid-evidence", "every evidence entry must be a non-empty digest string", {
      step: transition.step,
    });
  }
  const edge = findEdge(policy, transition.from, transition.to);
  if (edge === undefined) {
    throw new LifecycleError("illegal-edge", `policy "${policy.id}" does not allow "${transition.from}" -> "${transition.to}"`, {
      policyId: policy.id,
      from: transition.from,
      to: transition.to,
      allowedTargets: policy.edges
        .filter((candidate) => candidate.from === transition.from)
        .map((candidate) => candidate.to),
    });
  }
  return deepFreeze({
    anchor: state.anchor,
    policyId: state.policyId,
    phase: transition.to,
    step: transition.step,
    enteredPhaseAtStep: transition.step,
    transitions: [
      ...state.transitions,
      {
        from: transition.from,
        to: transition.to,
        step: transition.step,
        reason: transition.reason,
        evidence: [...transition.evidence],
      },
    ],
    events: state.events,
  });
}

function advanceState(policy: LifecyclePolicy, state: LifecycleState, request: LifecycleTransitionRequest): LifecycleState {
  assertStateShape(state);
  const raw: unknown = request;
  if (raw === null || typeof raw !== "object") {
    throw new LifecycleError("invalid-transition", "advance requires a transition request object", {});
  }
  if (!isLifecyclePhaseId(request.to)) {
    throw new LifecycleError("invalid-transition", "advance target must be a lifecycle phase id", { to: request.to });
  }
  if (!Array.isArray(request.evidence)) {
    throw new LifecycleError("invalid-transition", "advance requires an evidence array", {});
  }
  return applyTransition(policy, state, {
    from: state.phase,
    to: request.to,
    step: state.step + 1,
    reason: request.reason,
    evidence: [...request.evidence],
  });
}

function phaseOfState(state: LifecycleState): LifecyclePhaseId {
  assertStateShape(state);
  return state.phase;
}

function historyOfState(state: LifecycleState): readonly LifecycleTransition[] {
  assertStateShape(state);
  return state.transitions;
}

function eventsOfState(state: LifecycleState): readonly LifecycleEvent[] {
  assertStateShape(state);
  return state.events;
}

/** Create a machine bound to a validated policy (defaults to the standard policy). */
export function init(policy: LifecyclePolicy = DEFAULT_LIFECYCLE_POLICY): LifecycleMachine {
  validateLifecyclePolicy(policy);
  const bound: LifecyclePolicy = deepFreeze({
    id: policy.id,
    edges: policy.edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
  });
  return {
    policy: bound,
    open: (anchor) => openState(bound, anchor),
    apply: (state, transition) => applyTransition(bound, state, transition),
    advance: (state, request) => advanceState(bound, state, request),
    record: (state, request) => appendEvent(state, request),
    phaseOf: (state) => phaseOfState(state),
    historyOf: (state) => historyOfState(state),
    eventsOf: (state) => eventsOfState(state),
    overviewOf: (state) => projectLifecycleOverview(state),
  };
}

/* ------------------------------------------------------------------ *
 * Module re-exports (the descriptor / module / index pattern)
 * ------------------------------------------------------------------ */

export { LIFECYCLE_PHASE_BY_ID, LIFECYCLE_PHASE_ORDER, LIFECYCLE_PHASES, isLifecyclePhaseId, phaseDefinitionOf, phaseOrdinal } from "./phases.ts";
export { DEFAULT_LIFECYCLE_POLICY, DEFAULT_LIFECYCLE_POLICY_ID, edgeKey, findEdge, isReworkTransition, validateLifecyclePolicy } from "./policy.ts";
export { LifecycleError, isLifecycleError } from "./errors.ts";
export type { LifecycleErrorDetails, LifecycleErrorCode } from "./errors.ts";
export { LIFECYCLE_ANCHOR_KINDS, LEARNING_OUTCOMES, isLifecycleAnchorKind, isLearningOutcome } from "./validate.ts";
export { LIFECYCLE_EVENT_KINDS, isLifecycleEventKind } from "./events.ts";
export { sha256Hex } from "./digest.ts";
export { canonicalizeLifecycleState, digestOfCanonical, lifecycleStateDigest, parseLifecycleState } from "./canonical.ts";
export { deriveLearnings, recordLearningNote } from "./learn.ts";
export { projectLifecycleOverview } from "./overview.ts";
export { LIFECYCLE_SNAPSHOT_FORMAT, bindWorldStore, restoreLifecycle, saveLifecycle } from "./persistence.ts";
export { attachRevision, attachSolution, attachSurface } from "./anchors.ts";
export { LIFECYCLE_PACKAGE_DESCRIPTOR } from "./descriptor.ts";
export type { LifecycleEnvironmentConstraints, LifecyclePackageDescriptor } from "./descriptor.ts";
