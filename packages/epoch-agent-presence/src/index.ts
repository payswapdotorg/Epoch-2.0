/**
 * Public barrel for @zcode/epoch-agent-presence.
 *
 * Exports EXACTLY the runtime names declared in PUBLIC_CONTRACT (see
 * src/contract.ts); type exports follow the same contract.
 * test/contract.test.ts asserts the runtime surface against the contract.
 */

export { canonicalJson, canonicalSha256, sha256Hex } from "./canonical.js";
export type { CanonicalJsonValue } from "./canonical.js";

export {
  CONTRACT_NAME,
  CONTRACT_REVISION,
  CONTRACT_LAWS,
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "./contract.js";
export type { ContractLaw, PublicContractEntry, PublicContractEntryKind } from "./contract.js";

export { isHex64, isKebabId, isNonEmptyString, isNonNegativeInteger } from "./validate.js";

export { LIMITATIONS_REPORT } from "./limitations.js";
export type { LimitationArea, LimitationRecord } from "./limitations.js";

export { MODULE_NAME, MODULE_ARTIFACTS, MODULE_MANIFEST_DIGEST } from "./module.js";
export type { ModuleArtifact, ModuleArtifactRole } from "./module.js";

export type {
  ActivityRecordDigest,
  AgentRecordDigest,
  Branded,
  EpochMillis,
  Hex64,
  KebabId,
  NonEmptyString,
  NonNegativeInteger,
  TaskRecordDigest,
  WorldModelEntityDigest,
} from "./types/brands.js";

export type { Orientation, WorldPosition } from "./types/geometry.js";

export type {
  ActivityRecordRef,
  SemanticRecordRef,
  TaskRecordRef,
  WorkDescriptor,
  WorkStatus,
} from "./types/work.js";

export type {
  AgentPresence,
  AgentPresenceIdentity,
  EntityBinding,
  FollowState,
  FollowTarget,
  PresenceDerivation,
  PresenceProjectionInput,
} from "./types/presence.js";

export type {
  BindTransition,
  FollowTransition,
  IdleTransition,
  MoveTransition,
  PresenceTransition,
  PresenceTransitionOk,
  PresenceTransitionRejected,
  PresenceTransitionRejection,
  PresenceTransitionResult,
} from "./types/transition.js";

export type { PositionPolicy, PresenceBadge, PresenceView } from "./types/view.js";

export type {
  AgentSummaryEntry,
  BindingCounts,
  FleetSummaryOk,
  FleetSummaryRejected,
  FleetSummaryRejection,
  FleetSummaryResult,
  FollowCounts,
  PresenceFleetSummary,
} from "./types/summary.js";

export {
  buildActivityRecordRef,
  buildAgentPresenceIdentity,
  buildCameraFollowTarget,
  buildEntityBinding,
  buildEntityFollowTarget,
  buildFollowNone,
  buildNoneBinding,
  buildOrientation,
  buildTaskRecordRef,
  buildWorkDescriptor,
  buildWorldPosition,
} from "./build/values.js";

export { projectPresence } from "./build/presence.js";

export {
  applyPresenceTransition,
  buildBindTransition,
  buildFollowTransition,
  buildIdleTransition,
  buildMoveTransition,
} from "./build/transition.js";

export { summarizePresence } from "./build/summary.js";

export { buildPresenceView, buildPresenceViews } from "./build/view.js";
