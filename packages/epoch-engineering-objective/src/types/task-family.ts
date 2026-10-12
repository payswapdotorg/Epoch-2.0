import type { Sha256Digest } from "../canonical.js";

/**
 * Task families and EXPLICIT automation denominators (W035 item 1).
 *
 * Denominators are data, never implied: a task class counts toward
 * automation measurement ONLY when it is explicitly listed as included;
 * every other class is excluded by the default policy.
 */

/** A named, versioned family of engineering tasks. */
export interface TaskFamily {
  readonly kind: "task-family";
  readonly familyId: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
}

/** Identity reference to a task family (familyId + version). */
export interface TaskFamilyRef {
  readonly kind: "task-family-ref";
  readonly familyId: string;
  readonly version: string;
}

/**
 * One task class inside a denominator, with the explicit rationale for why
 * it is included or excluded. Inclusion is expressed by list membership in
 * the denominator, never implied.
 */
export interface TaskClassRule {
  readonly kind: "task-class-rule";
  readonly classId: string;
  readonly description: string;
  readonly rationale: string;
}

/**
 * Default policy of every denominator: task classes that are not explicitly
 * listed as included never count toward automation measurement.
 */
export const AUTOMATION_DENOMINATOR_DEFAULT_POLICY = "exclude-unlisted" as const;

export type AutomationDenominatorDefaultPolicy =
  typeof AUTOMATION_DENOMINATOR_DEFAULT_POLICY;

/** Explicit definition of which task classes count as the denominator. */
export interface AutomationDenominator {
  readonly kind: "automation-denominator";
  readonly denominatorId: string;
  readonly familyRef: TaskFamilyRef;
  readonly includedTaskClasses: readonly TaskClassRule[];
  readonly excludedTaskClasses: readonly TaskClassRule[];
  readonly defaultPolicy: AutomationDenominatorDefaultPolicy;
  readonly definitionDigest: Sha256Digest;
}
