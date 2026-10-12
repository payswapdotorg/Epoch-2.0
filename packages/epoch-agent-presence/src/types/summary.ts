import type { AgentRecordDigest, EpochMillis, KebabId, NonNegativeInteger } from "./brands.js";
import type { PresenceBadge } from "./view.js";
import type { WorkStatus } from "./work.js";

/** Per-agent fleet summary entry; fleets are ordered by presence key. */
export interface AgentSummaryEntry {
  readonly kind: "agent-summary-entry";
  readonly presenceKey: KebabId;
  readonly agentRecord: AgentRecordDigest;
  readonly badge: PresenceBadge;
  readonly workStatus: WorkStatus;
  readonly revision: NonNegativeInteger;
  readonly recordedAt: EpochMillis;
}

/** Follow-state counts across a fleet. */
export interface FollowCounts {
  readonly none: NonNegativeInteger;
  readonly camera: NonNegativeInteger;
  readonly entity: NonNegativeInteger;
}

/** Binding-state counts across a fleet. */
export interface BindingCounts {
  readonly none: NonNegativeInteger;
  readonly entity: NonNegativeInteger;
}

/** Deterministic fleet summary over a set of presence records. */
export interface PresenceFleetSummary {
  readonly kind: "presence-fleet-summary";
  readonly agentCount: NonNegativeInteger;
  /** Entries sorted by presence key (ascending). */
  readonly entries: readonly AgentSummaryEntry[];
  readonly byBadge: Readonly<Record<PresenceBadge, NonNegativeInteger>>;
  readonly byWorkStatus: Readonly<Record<WorkStatus, NonNegativeInteger>>;
  readonly byFollow: FollowCounts;
  readonly byBinding: BindingCounts;
  /** Caller-supplied computation time; never generated. */
  readonly computedAt: EpochMillis;
}

/** Typed rejections for fleet summarization (domain states; never thrown). */
export type FleetSummaryRejection =
  | { readonly kind: "duplicate-presence-key"; readonly presenceKey: string }
  | { readonly kind: "duplicate-agent-record"; readonly agentRecord: string };

/** Successful fleet summary. */
export interface FleetSummaryOk {
  readonly ok: true;
  readonly summary: PresenceFleetSummary;
}

/** Rejected fleet summary with a typed reason. */
export interface FleetSummaryRejected {
  readonly ok: false;
  readonly rejection: FleetSummaryRejection;
}

/** Result of summarizePresence. */
export type FleetSummaryResult = FleetSummaryOk | FleetSummaryRejected;
