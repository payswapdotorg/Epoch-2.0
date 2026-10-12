import type { Sha256Digest } from "../canonical.js";
import type { DigestRef, TaskFamilyRef } from "./core.js";

/**
 * Typed distinction between execution modes. Human and arena executions
 * are VISIBLE and are never counted as automated successes.
 * ("arena" is a label required by the W035 work-order text itself; this
 * package imports nothing from any arena adapter package.)
 */
export type TaskExecutionMode =
  | {
      readonly mode: "automated";
      readonly executedBy: string;
      readonly evidence: DigestRef;
    }
  | { readonly mode: "human"; readonly reason: string }
  | { readonly mode: "arena"; readonly ref: DigestRef; readonly reason: string };

/** How one task was executed, and with what outcome. */
export interface TaskExecutionRecord {
  readonly kind: "task-execution-record";
  readonly taskId: string;
  readonly familyRef: TaskFamilyRef;
  readonly taskClassId: string;
  readonly mode: TaskExecutionMode;
  readonly outcome: "succeeded" | "failed" | "abandoned";
}

/** Escalation share for a family; escalated tasks stay VISIBLE (item 4). */
export interface EscalationRate {
  readonly kind: "escalation-rate";
  readonly rateId: string;
  readonly familyRef: TaskFamilyRef;
  readonly totalTasks: number;
  readonly automatedTasks: number;
  readonly automatedSuccesses: number;
  readonly escalatedHumanTasks: number;
  readonly escalatedArenaTasks: number;
  readonly escalatedTaskIds: readonly string[];
  readonly automatedSuccessTaskIds: readonly string[];
  readonly rate: number;
  readonly computedFromDigest: Sha256Digest;
}

/** One reuse observation with W031/W032 digest references. */
export interface CapabilityReuseObservation {
  readonly kind: "capability-reuse-observation";
  readonly taskId: string;
  readonly familyRef: TaskFamilyRef;
  readonly capabilityKey: string;
  readonly reused: boolean;
  readonly reproductionRef: DigestRef;
  readonly learningRef: DigestRef;
}

/** Per-capability reuse group. */
export interface ReusedCapability {
  readonly capabilityKey: string;
  readonly reproductionRef: DigestRef;
  readonly learningRef: DigestRef;
  readonly observedTasks: number;
  readonly reusedTasks: number;
  readonly reusedTaskIds: readonly string[];
}

/** Capability reuse share; non-automated tasks stay VISIBLE (item 4). */
export interface CapabilityReuseRate {
  readonly kind: "capability-reuse-rate";
  readonly rateId: string;
  readonly familyRef: TaskFamilyRef;
  readonly reuseOpportunities: number;
  readonly reuseEvents: number;
  readonly reusedCapabilities: readonly ReusedCapability[];
  readonly rate: number;
  readonly visibleNonAutomatedTaskIds: readonly string[];
  readonly computedFromDigest: Sha256Digest;
}
