/**
 * @zcode/epoch-lifecycle — public entrypoint (W022).
 *
 * The universal engineering lifecycle — Understand -> Decide -> Plan ->
 * Acquire -> Realize -> Observe/Actualize -> Verify -> Forecast -> Close ->
 * Learn — as pure data contracts plus a deterministic state machine that
 * organizes engineering work AROUND the world-model authority
 * (ARCHITECTURE-LOCK invariants 1, 4, 17) and never becomes a second
 * semantic authority. State is timestamp-free: monotonic step counters and
 * digest refs only.
 */

export { LIFECYCLE_PHASE_BY_ID, LIFECYCLE_PHASE_ORDER, LIFECYCLE_PHASES, isLifecyclePhaseId, phaseDefinitionOf, phaseOrdinal } from "./phases.ts";
export type { LifecyclePhaseDefinition, LifecyclePhaseId } from "./phases.ts";

export { LIFECYCLE_ANCHOR_KINDS, LIFECYCLE_EVENT_KINDS, isLifecycleAnchorKind, isLifecycleEventKind, isLearningOutcome } from "./types.ts";
export type {
  DerivedLearning,
  DigestRef,
  LearningNoteInput,
  LearningNotePayload,
  LearningOutcome,
  LifecycleAnchor,
  LifecycleAnchorKind,
  LifecycleEdge,
  LifecycleEdgeKind,
  LifecycleEnvironmentConstraints,
  LifecycleEvent,
  LifecycleEventKind,
  LifecycleEventRequest,
  LifecycleMachine,
  LifecycleOverview,
  LifecyclePackageDescriptor,
  LifecyclePhaseSummary,
  LifecyclePolicy,
  LifecycleSnapshot,
  LifecycleSnapshotStore,
  LifecycleState,
  LifecycleStateDigest,
  LifecycleTransition,
  LifecycleTransitionRequest,
} from "./types.ts";

export { LifecycleError, isLifecycleError } from "./errors.ts";
export type { LifecycleErrorDetails, LifecycleErrorCode } from "./errors.ts";

export { DEFAULT_LIFECYCLE_POLICY, DEFAULT_LIFECYCLE_POLICY_ID, edgeKey, findEdge, isReworkTransition, validateLifecyclePolicy } from "./policy.ts";

export { sha256Hex } from "./digest.ts";

export { canonicalizeLifecycleState, digestOfCanonical, lifecycleStateDigest, parseLifecycleState } from "./canonical.ts";

export { init } from "./machine.ts";

export { deriveLearnings, recordLearningNote } from "./learn.ts";

export { projectLifecycleOverview } from "./overview.ts";

export { LIFECYCLE_SNAPSHOT_FORMAT, bindWorldStore, lifecycleSnapshotKey, restoreLifecycle, saveLifecycle } from "./persistence.ts";

export { attachRevision, attachSolution, attachSurface } from "./anchors.ts";

export { LIFECYCLE_PACKAGE_DESCRIPTOR } from "./descriptor.ts";
