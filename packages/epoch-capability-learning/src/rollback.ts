import type { HumanIntervention } from "./refs.js";

/**
 * Rollback declarations (W032 §5) — data only.
 *
 * Rollback is advisory: this package records plans and triggers, and the
 * regression watch emits advisory signals; executing a rollback always
 * requires a human decision (no execution authority).
 */

export type GuardedMetric = "quality" | "safety" | "intervention-cost";

export type RollbackComparator = "drops-below" | "rises-above";

export interface RollbackTrigger {
  readonly metric: GuardedMetric;
  readonly comparator: RollbackComparator;
  readonly threshold: number;
}

export interface RollbackPlan {
  readonly previousStateRef: string;
  readonly triggers: readonly RollbackTrigger[];
  readonly authoredBy: HumanIntervention;
}

export interface RollbackActivationPolicy {
  readonly advisoryOnly: true;
  readonly decidedBy: "human-approval";
}

/** Rollback metadata that travels with every approved promotion. */
export interface RollbackMetadata {
  readonly plan: RollbackPlan;
  readonly replacesPromotionId: string | null;
  readonly activation: RollbackActivationPolicy;
}
