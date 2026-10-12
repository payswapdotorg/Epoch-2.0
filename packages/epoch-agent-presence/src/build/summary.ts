import type { EpochMillis, NonNegativeInteger } from "../types/brands.js";
import type { AgentPresence } from "../types/presence.js";
import type {
  AgentSummaryEntry,
  BindingCounts,
  FleetSummaryResult,
  FollowCounts,
  PresenceFleetSummary,
} from "../types/summary.js";
import type { PresenceBadge } from "../types/view.js";
import type { WorkStatus } from "../types/work.js";
import { isNonNegativeInteger } from "../validate.js";
import { isAgentPresence } from "./guards.js";
import { derivePresenceBadge } from "./view.js";

/**
 * summarizePresence: deterministic fleet summary. Entries are sorted by
 * presence key; duplicate presence keys and duplicate agent record digests
 * are typed rejections. `computedAt` is a caller-supplied timestamp.
 */
export function summarizePresence(
  presences: readonly AgentPresence[],
  computedAt: number,
): FleetSummaryResult {
  if (!isNonNegativeInteger(computedAt)) {
    throw new TypeError(
      "summarizePresence: computedAt must be a non-negative integer (epoch milliseconds)",
    );
  }
  for (const presence of presences) {
    if (!isAgentPresence(presence)) {
      throw new TypeError("summarizePresence: every entry must be a valid AgentPresence record");
    }
  }
  const seenKeys = new Set<string>();
  const seenAgents = new Set<string>();
  for (const presence of presences) {
    const presenceKey = presence.identity.presenceKey;
    if (seenKeys.has(presenceKey)) {
      return { ok: false, rejection: { kind: "duplicate-presence-key", presenceKey } };
    }
    seenKeys.add(presenceKey);
    const agentRecord = presence.identity.agentRecord;
    if (seenAgents.has(agentRecord)) {
      return { ok: false, rejection: { kind: "duplicate-agent-record", agentRecord } };
    }
    seenAgents.add(agentRecord);
  }
  const entries: AgentSummaryEntry[] = presences
    .map(
      (presence): AgentSummaryEntry => ({
        kind: "agent-summary-entry",
        presenceKey: presence.identity.presenceKey,
        agentRecord: presence.identity.agentRecord,
        badge: derivePresenceBadge(presence),
        workStatus: presence.work.status,
        revision: presence.revision,
        recordedAt: presence.recordedAt,
      }),
    )
    .sort((a, b) => (a.presenceKey < b.presenceKey ? -1 : a.presenceKey > b.presenceKey ? 1 : 0));
  const badgeCounts: Record<PresenceBadge, number> = {
    following: 0,
    bound: 0,
    working: 0,
    blocked: 0,
    idle: 0,
  };
  const workStatusCounts: Record<WorkStatus, number> = { idle: 0, active: 0, blocked: 0 };
  const followCounts: Record<"none" | "camera" | "entity", number> = {
    none: 0,
    camera: 0,
    entity: 0,
  };
  const bindingCounts: Record<"none" | "entity", number> = { none: 0, entity: 0 };
  for (const presence of presences) {
    badgeCounts[derivePresenceBadge(presence)] += 1;
    workStatusCounts[presence.work.status] += 1;
    switch (presence.follow.kind) {
      case "follow-none":
        followCounts.none += 1;
        break;
      case "follow-camera":
        followCounts.camera += 1;
        break;
      case "follow-entity":
        followCounts.entity += 1;
        break;
      default: {
        const exhaustive: never = presence.follow;
        throw new TypeError(
          `summarizePresence: unhandled follow kind: ${JSON.stringify(exhaustive)}`,
        );
      }
    }
    bindingCounts[presence.binding.kind === "binding-none" ? "none" : "entity"] += 1;
  }
  const summary: PresenceFleetSummary = {
    kind: "presence-fleet-summary",
    agentCount: presences.length as NonNegativeInteger,
    entries,
    byBadge: badgeCounts as Record<PresenceBadge, NonNegativeInteger>,
    byWorkStatus: workStatusCounts as Record<WorkStatus, NonNegativeInteger>,
    byFollow: followCounts as FollowCounts,
    byBinding: bindingCounts as BindingCounts,
    computedAt: computedAt as EpochMillis,
  };
  return { ok: true, summary };
}
