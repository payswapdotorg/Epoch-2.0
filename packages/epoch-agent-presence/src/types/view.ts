import type { AgentRecordDigest, EpochMillis, KebabId, NonNegativeInteger } from "./brands.js";
import type { Orientation, WorldPosition } from "./geometry.js";
import type { EntityBinding, FollowState } from "./presence.js";
import type { WorkStatus } from "./work.js";

/** Deterministic status badge (precedence: following > bound > work status). */
export type PresenceBadge = "following" | "bound" | "working" | "blocked" | "idle";

/** How the UI should treat the recorded position snapshot. */
export type PositionPolicy = "explicit" | "derived-from-follow" | "derived-from-binding";

/**
 * Provider-neutral read-model for the Solution UI: positions, orientations,
 * status badges. Typed data only — no rendering, no UI code in this package.
 */
export interface PresenceView {
  readonly kind: "presence-view";
  /** Agent-tools agent record digest (the identity authority). */
  readonly agentRecord: AgentRecordDigest;
  readonly presenceKey: KebabId;
  readonly revision: NonNegativeInteger;
  readonly position: WorldPosition;
  readonly orientation: Orientation;
  readonly badge: PresenceBadge;
  readonly workStatus: WorkStatus;
  readonly follow: FollowState;
  readonly binding: EntityBinding;
  readonly positionPolicy: PositionPolicy;
  readonly recordedAt: EpochMillis;
}
