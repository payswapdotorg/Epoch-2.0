import type { AgentPresence } from "../types/presence.js";
import type { PositionPolicy, PresenceBadge, PresenceView } from "../types/view.js";
import { isAgentPresence } from "./guards.js";

/**
 * Deterministic badge derivation. Precedence: following > bound > work status
 * (working / blocked / idle).
 */
export function derivePresenceBadge(presence: AgentPresence): PresenceBadge {
  if (presence.follow.kind !== "follow-none") {
    return "following";
  }
  if (presence.binding.kind !== "binding-none") {
    return "bound";
  }
  switch (presence.work.status) {
    case "active":
      return "working";
    case "blocked":
      return "blocked";
    case "idle":
      return "idle";
    default: {
      const exhaustive: never = presence.work.status;
      throw new TypeError(
        `derivePresenceBadge: unhandled work status: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/** Deterministic position policy: attached states derive position host-side. */
function derivePositionPolicy(presence: AgentPresence): PositionPolicy {
  if (presence.follow.kind !== "follow-none") {
    return "derived-from-follow";
  }
  if (presence.binding.kind !== "binding-none") {
    return "derived-from-binding";
  }
  return "explicit";
}

/**
 * buildPresenceView: derive the provider-neutral PresenceView read-model.
 * Typed data only; no rendering. Malformed input throws TypeError.
 */
export function buildPresenceView(presence: AgentPresence): PresenceView {
  if (!isAgentPresence(presence)) {
    throw new TypeError("buildPresenceView: presence must be a valid AgentPresence record");
  }
  return {
    kind: "presence-view",
    agentRecord: presence.identity.agentRecord,
    presenceKey: presence.identity.presenceKey,
    revision: presence.revision,
    position: presence.position,
    orientation: presence.orientation,
    badge: derivePresenceBadge(presence),
    workStatus: presence.work.status,
    follow: presence.follow,
    binding: presence.binding,
    positionPolicy: derivePositionPolicy(presence),
    recordedAt: presence.recordedAt,
  };
}

/**
 * buildPresenceViews: derive fleet views, deterministically ordered by
 * presence key (tie-break by agent record digest). Fleet validity itself is
 * summarizePresence's concern.
 */
export function buildPresenceViews(presences: readonly AgentPresence[]): readonly PresenceView[] {
  for (const presence of presences) {
    if (!isAgentPresence(presence)) {
      throw new TypeError("buildPresenceViews: every entry must be a valid AgentPresence record");
    }
  }
  return presences
    .map((presence): PresenceView => buildPresenceView(presence))
    .sort((a, b) => {
      if (a.presenceKey !== b.presenceKey) {
        return a.presenceKey < b.presenceKey ? -1 : 1;
      }
      if (a.agentRecord !== b.agentRecord) {
        return a.agentRecord < b.agentRecord ? -1 : 1;
      }
      return 0;
    });
}
