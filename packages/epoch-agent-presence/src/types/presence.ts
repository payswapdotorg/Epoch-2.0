import type {
  AgentRecordDigest,
  EpochMillis,
  KebabId,
  NonNegativeInteger,
  WorldModelEntityDigest,
} from "./brands.js";
import type { Orientation, WorldPosition } from "./geometry.js";
import type { SemanticRecordRef, WorkDescriptor } from "./work.js";

/**
 * Identity of a projected agent: the agent-tools record digest (the identity
 * authority, referenced by digest only — never re-defined here) plus a stable
 * local key identifying THIS presence projection inside a fleet.
 */
export interface AgentPresenceIdentity {
  readonly kind: "agent-presence-identity";
  /** Digest of the agent-tools agent record — the agent identity authority. */
  readonly agentRecord: AgentRecordDigest;
  /**
   * Stable kebab-case key for this presence projection. Not an agent identity:
   * the authority remains the agent record digest.
   */
  readonly presenceKey: KebabId;
}

/** The agent's visuals are not attached to any entity. */
export interface NoneBinding {
  readonly kind: "binding-none";
}

/** The agent's visuals are attached to a world-model entity (by digest). */
export interface EntityBindingState {
  readonly kind: "binding-entity";
  readonly entity: WorldModelEntityDigest;
}

/** Entity binding state: none, or a world-model entity digest. */
export type EntityBinding = NoneBinding | EntityBindingState;

/** The agent is not following anything. */
export interface FollowNone {
  readonly kind: "follow-none";
}

/** The agent follows the host camera. */
export interface FollowCamera {
  readonly kind: "follow-camera";
}

/** The agent follows a world-model entity (by digest). */
export interface FollowEntity {
  readonly kind: "follow-entity";
  readonly entity: WorldModelEntityDigest;
}

/** Follow target: camera or a world-model entity digest. */
export type FollowTarget = FollowCamera | FollowEntity;

/** Follow state: none, camera, or a world-model entity digest. */
export type FollowState = FollowNone | FollowTarget;

/** Lineage of a presence projection: which semantic records it derived from. */
export interface PresenceDerivation {
  readonly kind: "presence-derivation";
  /** Agent-tools task / environment-activity records consumed, in input order. */
  readonly semanticRecords: readonly SemanticRecordRef[];
  /** Caller-supplied projection time; never generated. */
  readonly projectedAt: EpochMillis;
}

/**
 * A per-agent derived visual projection. Presence is derived state: it never
 * edits task/activity semantics and never becomes a second task authority.
 */
export interface AgentPresence {
  readonly kind: "agent-presence";
  /** Presence revision; 0 at projection, +1 per applied transition. */
  readonly revision: NonNegativeInteger;
  readonly identity: AgentPresenceIdentity;
  /** Last explicit or attachment-time position snapshot. */
  readonly position: WorldPosition;
  /** Heading snapshot; normalized yaw in [0, 2*pi). */
  readonly orientation: Orientation;
  /** Derived work descriptor (agent-tools / activity semantics by digest). */
  readonly work: WorkDescriptor;
  readonly binding: EntityBinding;
  readonly follow: FollowState;
  readonly derivation: PresenceDerivation;
  /** Caller-supplied time of the projection or last applied transition. */
  readonly recordedAt: EpochMillis;
}

/** Input to projectPresence. All timestamps and digests are inputs. */
export interface PresenceProjectionInput {
  readonly identity: AgentPresenceIdentity;
  readonly position: WorldPosition;
  readonly orientation: Orientation;
  readonly work: WorkDescriptor;
  readonly binding: EntityBinding;
  readonly follow: FollowState;
  /** Additional agent-tools task / environment-activity records consumed. */
  readonly additionalSemanticRecords?: readonly SemanticRecordRef[];
  /** Epoch milliseconds; caller-supplied, never generated. */
  readonly recordedAt: number;
}
