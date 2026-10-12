import type {
  ActivityRecordDigest,
  AgentRecordDigest,
  KebabId,
  NonEmptyString,
  TaskRecordDigest,
  WorldModelEntityDigest,
} from "../types/brands.js";
import type { Orientation, WorldPosition } from "../types/geometry.js";
import type {
  ActivityRecordRef,
  SemanticRecordRef,
  TaskRecordRef,
  WorkDescriptor,
  WorkStatus,
} from "../types/work.js";
import type {
  AgentPresenceIdentity,
  EntityBindingState,
  FollowCamera,
  FollowEntity,
  FollowNone,
  NoneBinding,
} from "../types/presence.js";
import { isHex64, isKebabId, isNonEmptyString, isWorkStatus } from "../validate.js";
import { isSemanticRecordRef } from "./guards.js";

const TWO_PI = 2 * Math.PI;

/** Build a validated world position (finite x/y/z). */
export function buildWorldPosition(x: number, y: number, z: number): WorldPosition {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new TypeError("buildWorldPosition: x, y, and z must be finite numbers");
  }
  return { kind: "world-position", x, y, z };
}

/** Build an orientation; yaw is normalized deterministically into [0, 2*pi). */
export function buildOrientation(yawRadians: number): Orientation {
  if (!Number.isFinite(yawRadians)) {
    throw new TypeError("buildOrientation: yawRadians must be a finite number");
  }
  const normalized = ((yawRadians % TWO_PI) + TWO_PI) % TWO_PI;
  return { kind: "orientation", yawRadians: normalized };
}

/** Build a validated agent presence identity (digest + projection key). */
export function buildAgentPresenceIdentity(
  agentRecord: string,
  presenceKey: string,
): AgentPresenceIdentity {
  if (!isHex64(agentRecord)) {
    throw new TypeError(
      "buildAgentPresenceIdentity: agentRecord must be a 64-character lowercase hex digest",
    );
  }
  if (!isKebabId(presenceKey)) {
    throw new TypeError("buildAgentPresenceIdentity: presenceKey must be a kebab-case identifier");
  }
  return {
    kind: "agent-presence-identity",
    agentRecord: agentRecord as AgentRecordDigest,
    presenceKey: presenceKey as KebabId,
  };
}

/** Build a reference to an agent-tools task record (by digest). */
export function buildTaskRecordRef(digest: string): TaskRecordRef {
  if (!isHex64(digest)) {
    throw new TypeError("buildTaskRecordRef: digest must be a 64-character lowercase hex digest");
  }
  return { kind: "task-record", digest: digest as TaskRecordDigest };
}

/** Build a reference to an environment-activity record (by digest). */
export function buildActivityRecordRef(digest: string): ActivityRecordRef {
  if (!isHex64(digest)) {
    throw new TypeError(
      "buildActivityRecordRef: digest must be a 64-character lowercase hex digest",
    );
  }
  return { kind: "activity-record", digest: digest as ActivityRecordDigest };
}

/** Build a validated derived work descriptor. */
export function buildWorkDescriptor(
  status: WorkStatus,
  label: string,
  source: SemanticRecordRef,
): WorkDescriptor {
  if (!isWorkStatus(status)) {
    throw new TypeError("buildWorkDescriptor: status must be one of idle, active, or blocked");
  }
  if (!isNonEmptyString(label)) {
    throw new TypeError("buildWorkDescriptor: label must be a non-empty string");
  }
  if (!isSemanticRecordRef(source)) {
    throw new TypeError("buildWorkDescriptor: source must be a valid SemanticRecordRef");
  }
  return { kind: "work-descriptor", status, label: label as NonEmptyString, source };
}

/** Build the unbound entity-binding state. */
export function buildNoneBinding(): NoneBinding {
  return { kind: "binding-none" };
}

/** Build an entity binding for a world-model entity digest. */
export function buildEntityBinding(entity: string): EntityBindingState {
  if (!isHex64(entity)) {
    throw new TypeError("buildEntityBinding: entity must be a 64-character lowercase hex digest");
  }
  return { kind: "binding-entity", entity: entity as WorldModelEntityDigest };
}

/** Build the not-following state. */
export function buildFollowNone(): FollowNone {
  return { kind: "follow-none" };
}

/** Build the camera follow target. */
export function buildCameraFollowTarget(): FollowCamera {
  return { kind: "follow-camera" };
}

/** Build an entity follow target (world-model entity digest). */
export function buildEntityFollowTarget(entity: string): FollowEntity {
  if (!isHex64(entity)) {
    throw new TypeError(
      "buildEntityFollowTarget: entity must be a 64-character lowercase hex digest",
    );
  }
  return { kind: "follow-entity", entity: entity as WorldModelEntityDigest };
}
