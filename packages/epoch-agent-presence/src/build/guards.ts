import type {
  AgentPresence,
  AgentPresenceIdentity,
  EntityBinding,
  FollowState,
  FollowTarget,
  PresenceDerivation,
} from "../types/presence.js";
import type { Orientation, WorldPosition } from "../types/geometry.js";
import type {
  ActivityRecordRef,
  SemanticRecordRef,
  TaskRecordRef,
  WorkDescriptor,
} from "../types/work.js";
import type { PresenceTransition } from "../types/transition.js";
import {
  isFiniteNumber,
  isHex64,
  isKebabId,
  isNonEmptyString,
  isNonNegativeInteger,
  isWorkStatus,
} from "../validate.js";

const TWO_PI = 2 * Math.PI;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Guard: a valid WorldPosition. */
export function isWorldPosition(value: unknown): value is WorldPosition {
  return (
    isRecord(value) &&
    value["kind"] === "world-position" &&
    isFiniteNumber(value["x"]) &&
    isFiniteNumber(value["y"]) &&
    isFiniteNumber(value["z"])
  );
}

/** Guard: a valid Orientation (yaw normalized into [0, 2*pi)). */
export function isOrientation(value: unknown): value is Orientation {
  if (!isRecord(value) || value["kind"] !== "orientation") {
    return false;
  }
  const yaw = value["yawRadians"];
  return isFiniteNumber(yaw) && yaw >= 0 && yaw < TWO_PI;
}

/** Guard: a valid TaskRecordRef. */
export function isTaskRecordRef(value: unknown): value is TaskRecordRef {
  return isRecord(value) && value["kind"] === "task-record" && isHex64(value["digest"]);
}

/** Guard: a valid ActivityRecordRef. */
export function isActivityRecordRef(value: unknown): value is ActivityRecordRef {
  return isRecord(value) && value["kind"] === "activity-record" && isHex64(value["digest"]);
}

/** Guard: a valid SemanticRecordRef. */
export function isSemanticRecordRef(value: unknown): value is SemanticRecordRef {
  return isTaskRecordRef(value) || isActivityRecordRef(value);
}

/** Guard: a valid WorkDescriptor. */
export function isWorkDescriptor(value: unknown): value is WorkDescriptor {
  return (
    isRecord(value) &&
    value["kind"] === "work-descriptor" &&
    isWorkStatus(value["status"]) &&
    isNonEmptyString(value["label"]) &&
    isSemanticRecordRef(value["source"])
  );
}

/** Guard: a valid AgentPresenceIdentity. */
export function isAgentPresenceIdentity(value: unknown): value is AgentPresenceIdentity {
  return (
    isRecord(value) &&
    value["kind"] === "agent-presence-identity" &&
    isHex64(value["agentRecord"]) &&
    isKebabId(value["presenceKey"])
  );
}

/** Guard: a valid EntityBinding. */
export function isEntityBinding(value: unknown): value is EntityBinding {
  if (!isRecord(value)) {
    return false;
  }
  if (value["kind"] === "binding-none") {
    return true;
  }
  return value["kind"] === "binding-entity" && isHex64(value["entity"]);
}

/** Guard: a valid FollowTarget. */
export function isFollowTarget(value: unknown): value is FollowTarget {
  if (!isRecord(value)) {
    return false;
  }
  if (value["kind"] === "follow-camera") {
    return true;
  }
  return value["kind"] === "follow-entity" && isHex64(value["entity"]);
}

/** Guard: a valid FollowState. */
export function isFollowState(value: unknown): value is FollowState {
  return isFollowTarget(value) || (isRecord(value) && value["kind"] === "follow-none");
}

/** Guard: a valid PresenceDerivation. */
export function isPresenceDerivation(value: unknown): value is PresenceDerivation {
  if (!isRecord(value) || value["kind"] !== "presence-derivation") {
    return false;
  }
  const records = value["semanticRecords"];
  if (!Array.isArray(records)) {
    return false;
  }
  const list: readonly unknown[] = records;
  return (
    list.every((ref) => isSemanticRecordRef(ref)) && isNonNegativeInteger(value["projectedAt"])
  );
}

/** Guard: a valid AgentPresence record (invariant: never bound AND following). */
export function isAgentPresence(value: unknown): value is AgentPresence {
  if (!isRecord(value) || value["kind"] !== "agent-presence") {
    return false;
  }
  const binding = value["binding"];
  const follow = value["follow"];
  const attached = isEntityBinding(binding) && binding.kind === "binding-entity";
  const following = isFollowState(follow) && follow.kind !== "follow-none";
  if (attached && following) {
    return false;
  }
  return (
    isNonNegativeInteger(value["revision"]) &&
    isAgentPresenceIdentity(value["identity"]) &&
    isWorldPosition(value["position"]) &&
    isOrientation(value["orientation"]) &&
    isWorkDescriptor(value["work"]) &&
    isEntityBinding(binding) &&
    isFollowState(follow) &&
    isPresenceDerivation(value["derivation"]) &&
    isNonNegativeInteger(value["recordedAt"])
  );
}

/** Guard: a valid PresenceTransition. */
export function isPresenceTransition(value: unknown): value is PresenceTransition {
  if (!isRecord(value)) {
    return false;
  }
  const kind = value["kind"];
  if (kind === "move") {
    return (
      isWorldPosition(value["to"]) &&
      (value["orientation"] === undefined || isOrientation(value["orientation"]))
    );
  }
  if (kind === "bind") {
    return isHex64(value["entity"]);
  }
  if (kind === "follow") {
    return isFollowTarget(value["target"]);
  }
  return kind === "idle";
}
