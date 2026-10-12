import type { EpochMillis, NonNegativeInteger } from "../types/brands.js";
import type { AgentPresence, PresenceProjectionInput } from "../types/presence.js";
import type { SemanticRecordRef } from "../types/work.js";
import { isNonNegativeInteger } from "../validate.js";
import {
  isAgentPresenceIdentity,
  isEntityBinding,
  isFollowState,
  isOrientation,
  isSemanticRecordRef,
  isWorkDescriptor,
  isWorldPosition,
} from "./guards.js";

/**
 * projectPresence: derive an AgentPresence record from agent/task/activity
 * digest references plus placement input. Pure and deterministic; timestamps
 * are inputs. Malformed structural input throws TypeError.
 */
export function projectPresence(input: PresenceProjectionInput): AgentPresence {
  if (!isAgentPresenceIdentity(input.identity)) {
    throw new TypeError("projectPresence: identity must be a valid AgentPresenceIdentity");
  }
  if (!isWorldPosition(input.position)) {
    throw new TypeError("projectPresence: position must be a valid WorldPosition");
  }
  if (!isOrientation(input.orientation)) {
    throw new TypeError("projectPresence: orientation must be a valid Orientation");
  }
  if (!isWorkDescriptor(input.work)) {
    throw new TypeError("projectPresence: work must be a valid WorkDescriptor");
  }
  if (!isEntityBinding(input.binding)) {
    throw new TypeError("projectPresence: binding must be a valid EntityBinding");
  }
  if (!isFollowState(input.follow)) {
    throw new TypeError("projectPresence: follow must be a valid FollowState");
  }
  if (input.binding.kind === "binding-entity" && input.follow.kind !== "follow-none") {
    throw new TypeError("projectPresence: an agent cannot be bound and following at the same time");
  }
  if (!isNonNegativeInteger(input.recordedAt)) {
    throw new TypeError(
      "projectPresence: recordedAt must be a non-negative integer (epoch milliseconds)",
    );
  }
  const additional: readonly SemanticRecordRef[] = input.additionalSemanticRecords ?? [];
  for (const ref of additional) {
    if (!isSemanticRecordRef(ref)) {
      throw new TypeError(
        "projectPresence: additionalSemanticRecords entries must be valid SemanticRecordRef values",
      );
    }
  }
  const semanticRecords: readonly SemanticRecordRef[] = [input.work.source, ...additional];
  const seen = new Set<string>();
  for (const ref of semanticRecords) {
    const key = `${ref.kind}:${ref.digest}`;
    if (seen.has(key)) {
      throw new TypeError(`projectPresence: duplicate semantic record reference (${key})`);
    }
    seen.add(key);
  }
  const recordedAt = input.recordedAt as EpochMillis;
  return {
    kind: "agent-presence",
    revision: 0 as NonNegativeInteger,
    identity: input.identity,
    position: input.position,
    orientation: input.orientation,
    work: input.work,
    binding: input.binding,
    follow: input.follow,
    derivation: {
      kind: "presence-derivation",
      semanticRecords,
      projectedAt: recordedAt,
    },
    recordedAt,
  };
}
