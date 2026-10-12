import type { Digest, EntityDigest, Iso8601, KebabId } from "./shared.js";
import type { BoqLineItem } from "./boq.js";
import type { ConstraintRecord } from "./constraint.js";
import type { InspectorView } from "./inspector.js";
import type { QuantityTakeoff } from "./quantity.js";

/**
 * Finding types: inspection findings (severity, evidence refs by digest),
 * the status lifecycle as DATA, and the derived bidirectional link index.
 */

export const FINDING_SEVERITIES = ["info", "minor", "major", "critical"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_STATUSES = ["open", "in-review", "resolved", "dismissed"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Status lifecycle as DATA — the single authority for legal transitions. */
export const FINDING_STATUS_TRANSITIONS: Readonly<Record<FindingStatus, readonly FindingStatus[]>> =
  {
    dismissed: [],
    "in-review": ["dismissed", "open", "resolved"],
    open: ["dismissed", "in-review"],
    resolved: [],
  };

/** One recorded status transition. */
export interface FindingStatusTransition {
  readonly from: FindingStatus;
  readonly to: FindingStatus;
  /** Input timestamp — never generated. */
  readonly at: Iso8601;
}

/** An inspection finding record. */
export interface FindingRecord {
  readonly findingId: KebabId;
  readonly entityDigest: EntityDigest;
  readonly severity: FindingSeverity;
  readonly status: FindingStatus;
  readonly title: string;
  readonly detail?: string;
  /** Evidence references — canonical digests only. */
  readonly evidence: readonly Digest[];
  /** Constraint records linked to this finding (same entity). */
  readonly constraintRefs: readonly KebabId[];
  /** BOQ line items linked to this finding (same entity). */
  readonly boqItemRefs: readonly KebabId[];
  readonly raisedAt: Iso8601;
  readonly statusHistory: readonly FindingStatusTransition[];
}

/** Raw (unbranded) input for the buildFinding machine. */
export interface FindingInput {
  readonly findingId: string;
  readonly entityDigest: string;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly detail?: string;
  readonly evidence: readonly string[];
  readonly constraintRefs: readonly string[];
  readonly boqItemRefs: readonly string[];
  readonly raisedAt: string;
}

/** Typed rejections of the buildFinding machine. */
export type FindingRejection =
  | { readonly kind: "invalid-finding-id"; readonly findingId: string }
  | { readonly kind: "invalid-entity-digest"; readonly entityDigest: string }
  | { readonly kind: "invalid-severity"; readonly severity: string }
  | { readonly kind: "invalid-title"; readonly title: string }
  | { readonly kind: "invalid-detail" }
  | { readonly kind: "empty-evidence" }
  | { readonly kind: "invalid-evidence"; readonly index: number; readonly digest: string }
  | {
      readonly kind: "invalid-constraint-ref";
      readonly index: number;
      readonly constraintId: string;
    }
  | { readonly kind: "invalid-boq-item-ref"; readonly index: number; readonly itemId: string }
  | { readonly kind: "invalid-raised-at"; readonly raisedAt: string };

/** Typed rejections of the advanceFindingStatus machine. */
export type FindingTransitionRejection =
  | { readonly kind: "invalid-next-status"; readonly nextStatus: string }
  | { readonly kind: "invalid-at"; readonly at: string }
  | {
      readonly kind: "illegal-transition";
      readonly from: FindingStatus;
      readonly to: FindingStatus;
    };

/** Input for the buildLinkIndex machine. */
export interface LinkIndexInput {
  readonly inspectorViews: readonly InspectorView[];
  readonly takeoffs: readonly QuantityTakeoff[];
  readonly constraints: readonly ConstraintRecord[];
  readonly boqItems: readonly BoqLineItem[];
  readonly findings: readonly FindingRecord[];
}

/** Derived (never persisted) reverse index: everything one entity links to. */
export interface EntityLinks {
  readonly entityDigest: EntityDigest;
  readonly inspectorViewIds: readonly KebabId[];
  readonly takeoffIds: readonly KebabId[];
  readonly constraintIds: readonly KebabId[];
  readonly boqItemIds: readonly KebabId[];
  readonly findingIds: readonly KebabId[];
}

/** The bidirectional link index — derived on demand, no duplicate ledger. */
export interface LinkIndex {
  /** Sorted by entityDigest — deterministic. */
  readonly byEntity: readonly EntityLinks[];
}

/** Typed rejections of the buildLinkIndex machine. */
export type LinkResolutionRejection =
  | { readonly kind: "duplicate-view-id"; readonly viewId: string }
  | { readonly kind: "duplicate-takeoff-id"; readonly takeoffId: string }
  | { readonly kind: "duplicate-constraint-id"; readonly constraintId: string }
  | { readonly kind: "duplicate-boq-item-id"; readonly itemId: string }
  | { readonly kind: "duplicate-finding-id"; readonly findingId: string }
  | { readonly kind: "dangling-takeoff-ref"; readonly viewId: string; readonly takeoffId: string }
  | {
      readonly kind: "dangling-constraint-ref";
      readonly findingId: string;
      readonly constraintId: string;
    }
  | { readonly kind: "dangling-boq-item-ref"; readonly findingId: string; readonly itemId: string }
  | {
      readonly kind: "cross-entity-constraint-ref";
      readonly findingId: string;
      readonly constraintId: string;
      readonly entityDigest: string;
    }
  | {
      readonly kind: "cross-entity-boq-item-ref";
      readonly findingId: string;
      readonly itemId: string;
      readonly entityDigest: string;
    }
  | {
      readonly kind: "cross-entity-takeoff-ref";
      readonly viewId: string;
      readonly takeoffId: string;
      readonly entityDigest: string;
    };
