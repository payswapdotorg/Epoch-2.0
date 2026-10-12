import type { WorldModelEntityDigest } from "./brands.js";
import type { Orientation, WorldPosition } from "./geometry.js";
import type { AgentPresence, FollowTarget } from "./presence.js";

/** Move the agent to an explicit world position, optionally re-orienting. */
export interface MoveTransition {
  readonly kind: "move";
  readonly to: WorldPosition;
  readonly orientation?: Orientation;
}

/** Attach the agent's visuals to a world-model entity (by digest). */
export interface BindTransition {
  readonly kind: "bind";
  readonly entity: WorldModelEntityDigest;
}

/** Start following the camera or a world-model entity. */
export interface FollowTransition {
  readonly kind: "follow";
  readonly target: FollowTarget;
}

/**
 * Release the follow state and the entity binding. The work descriptor is
 * derived state and is never touched by transitions.
 */
export interface IdleTransition {
  readonly kind: "idle";
}

/** Typed presence transitions: move, bind, follow, idle. */
export type PresenceTransition =
  | MoveTransition
  | BindTransition
  | FollowTransition
  | IdleTransition;

/** Typed rejections for illegal presence transitions (domain states; never thrown). */
export type PresenceTransitionRejection =
  | { readonly kind: "move-rejected"; readonly reason: "position-derived-from-follow" }
  | { readonly kind: "move-rejected"; readonly reason: "position-derived-from-binding" }
  | { readonly kind: "bind-rejected"; readonly reason: "already-bound" }
  | { readonly kind: "bind-rejected"; readonly reason: "while-following" }
  | { readonly kind: "follow-rejected"; readonly reason: "already-following" }
  | { readonly kind: "follow-rejected"; readonly reason: "while-bound" }
  | { readonly kind: "idle-rejected"; readonly reason: "nothing-to-release" };

/** A legal transition applied; the input record is never mutated. */
export interface PresenceTransitionOk {
  readonly ok: true;
  readonly presence: AgentPresence;
}

/** An illegal transition rejected with a typed reason. */
export interface PresenceTransitionRejected {
  readonly ok: false;
  readonly rejection: PresenceTransitionRejection;
}

/** Result of applyPresenceTransition. */
export type PresenceTransitionResult = PresenceTransitionOk | PresenceTransitionRejected;
