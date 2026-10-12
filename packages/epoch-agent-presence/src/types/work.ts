import type { ActivityRecordDigest, NonEmptyString, TaskRecordDigest } from "./brands.js";

/** Work status vocabulary mirrored at badge level from agent-tools / activity semantics. */
export type WorkStatus = "idle" | "active" | "blocked";

/** Reference to an agent-tools task record (by digest only; never re-defined here). */
export interface TaskRecordRef {
  readonly kind: "task-record";
  readonly digest: TaskRecordDigest;
}

/** Reference to an environment-activity record (by digest only; never re-defined here). */
export interface ActivityRecordRef {
  readonly kind: "activity-record";
  readonly digest: ActivityRecordDigest;
}

/** The semantic record a work descriptor derives from. */
export type SemanticRecordRef = TaskRecordRef | ActivityRecordRef;

/** Derived, display-level descriptor of what an agent is working on. */
export interface WorkDescriptor {
  readonly kind: "work-descriptor";
  readonly status: WorkStatus;
  /** Short display label carried from the source record; presence never edits it. */
  readonly label: NonEmptyString;
  /** The semantic record this descriptor derives from. */
  readonly source: SemanticRecordRef;
}
