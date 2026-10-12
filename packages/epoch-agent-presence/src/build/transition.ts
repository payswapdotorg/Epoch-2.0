import type { EpochMillis, NonNegativeInteger, WorldModelEntityDigest } from "../types/brands.js";
import type { Orientation, WorldPosition } from "../types/geometry.js";
import type { AgentPresence, FollowTarget } from "../types/presence.js";
import type {
  BindTransition,
  FollowTransition,
  IdleTransition,
  MoveTransition,
  PresenceTransition,
  PresenceTransitionResult,
} from "../types/transition.js";
import { isHex64, isNonNegativeInteger } from "../validate.js";
import {
  isAgentPresence,
  isFollowTarget,
  isOrientation,
  isPresenceTransition,
  isWorldPosition,
} from "./guards.js";

const nextRevision = (revision: NonNegativeInteger): NonNegativeInteger =>
  (revision + 1) as NonNegativeInteger;

/**
 * applyPresenceTransition: apply a typed visual transition (move, bind,
 * follow, idle). Illegal transitions return typed rejections and never mutate
 * the input record. The work descriptor is derived state and is never edited.
 * `at` is a caller-supplied timestamp (never generated).
 */
export function applyPresenceTransition(
  presence: AgentPresence,
  transition: PresenceTransition,
  at: number,
): PresenceTransitionResult {
  if (!isAgentPresence(presence)) {
    throw new TypeError("applyPresenceTransition: presence must be a valid AgentPresence record");
  }
  if (!isPresenceTransition(transition)) {
    throw new TypeError("applyPresenceTransition: transition must be a valid PresenceTransition");
  }
  if (!isNonNegativeInteger(at)) {
    throw new TypeError(
      "applyPresenceTransition: at must be a non-negative integer (epoch milliseconds)",
    );
  }
  const recordedAt = at as EpochMillis;
  switch (transition.kind) {
    case "move": {
      if (presence.follow.kind !== "follow-none") {
        return {
          ok: false,
          rejection: { kind: "move-rejected", reason: "position-derived-from-follow" },
        };
      }
      if (presence.binding.kind !== "binding-none") {
        return {
          ok: false,
          rejection: { kind: "move-rejected", reason: "position-derived-from-binding" },
        };
      }
      const orientation =
        transition.orientation === undefined ? presence.orientation : transition.orientation;
      return {
        ok: true,
        presence: {
          ...presence,
          revision: nextRevision(presence.revision),
          position: transition.to,
          orientation,
          recordedAt,
        },
      };
    }
    case "bind": {
      if (presence.binding.kind !== "binding-none") {
        return { ok: false, rejection: { kind: "bind-rejected", reason: "already-bound" } };
      }
      if (presence.follow.kind !== "follow-none") {
        return { ok: false, rejection: { kind: "bind-rejected", reason: "while-following" } };
      }
      return {
        ok: true,
        presence: {
          ...presence,
          revision: nextRevision(presence.revision),
          binding: { kind: "binding-entity", entity: transition.entity },
          recordedAt,
        },
      };
    }
    case "follow": {
      if (presence.follow.kind !== "follow-none") {
        return { ok: false, rejection: { kind: "follow-rejected", reason: "already-following" } };
      }
      if (presence.binding.kind !== "binding-none") {
        return { ok: false, rejection: { kind: "follow-rejected", reason: "while-bound" } };
      }
      return {
        ok: true,
        presence: {
          ...presence,
          revision: nextRevision(presence.revision),
          follow: transition.target,
          recordedAt,
        },
      };
    }
    case "idle": {
      if (presence.follow.kind === "follow-none" && presence.binding.kind === "binding-none") {
        return { ok: false, rejection: { kind: "idle-rejected", reason: "nothing-to-release" } };
      }
      return {
        ok: true,
        presence: {
          ...presence,
          revision: nextRevision(presence.revision),
          follow: { kind: "follow-none" },
          binding: { kind: "binding-none" },
          recordedAt,
        },
      };
    }
    default: {
      const exhaustive: never = transition;
      throw new TypeError(
        `applyPresenceTransition: unhandled transition kind: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/** Build a move transition to an explicit world position. */
export function buildMoveTransition(to: WorldPosition, orientation?: Orientation): MoveTransition {
  if (!isWorldPosition(to)) {
    throw new TypeError("buildMoveTransition: to must be a valid WorldPosition");
  }
  if (orientation !== undefined && !isOrientation(orientation)) {
    throw new TypeError(
      "buildMoveTransition: orientation must be a valid Orientation when provided",
    );
  }
  return orientation === undefined ? { kind: "move", to } : { kind: "move", to, orientation };
}

/** Build a bind transition for a world-model entity digest. */
export function buildBindTransition(entity: string): BindTransition {
  if (!isHex64(entity)) {
    throw new TypeError("buildBindTransition: entity must be a 64-character lowercase hex digest");
  }
  return { kind: "bind", entity: entity as WorldModelEntityDigest };
}

/** Build a follow transition for a camera or entity target. */
export function buildFollowTransition(target: FollowTarget): FollowTransition {
  if (!isFollowTarget(target)) {
    throw new TypeError("buildFollowTransition: target must be a valid FollowTarget");
  }
  return { kind: "follow", target };
}

/** Build an idle (release) transition. */
export function buildIdleTransition(): IdleTransition {
  return { kind: "idle" };
}
