/**
 * Task-package types: what the system sends to the Arena.
 */
import type {
  DeliverableKind,
  EvidenceExport,
  GapRef,
  Hex64,
  Iso8601,
  NonEmptyString,
} from "./types-core.js";

/** What the scoped task is (and is not) about. */
export interface TaskScope {
  readonly objective: NonEmptyString;
  readonly domains: readonly NonEmptyString[];
  /** Evidence must carry at least one of these tags to be exported. */
  readonly includesTags: readonly string[];
  /** Evidence carrying any of these tags is never exported. */
  readonly excludesTags: readonly string[];
  readonly outOfScope: readonly NonEmptyString[];
}

/** Budget as data — the adapter never procures anything. */
export interface TaskBudget {
  readonly currency: "usd";
  readonly maxCents: number;
  readonly maxWallClockHours: number;
  /** Minimization bound: max evidence items per task package. */
  readonly maxEvidenceItems: number;
}

/** Expertise the task requires. */
export interface ExpertiseRequirement {
  readonly area: NonEmptyString;
  readonly minYears: number;
  /** Digests of (redacted) credential exports. */
  readonly credentialRefs: readonly Hex64[];
}

/** Deterministic check attached to an acceptance criterion. */
export type CriterionCheck =
  | { readonly type: "deliverable-count"; readonly min: number }
  | {
      readonly type: "deliverable-kind-present";
      readonly kind: DeliverableKind;
    }
  | { readonly type: "evidence-backed-claims"; readonly minClaims: number }
  | { readonly type: "min-confidence"; readonly min: number };

/**
 * Acceptance criterion. `must-have` is a HARD requirement — it can only
 * be met or unmet (never partial). `should-have` may be partially met;
 * `partialFloor` is the minimum fraction (0..1) that still counts as an
 * acceptable partial result.
 */
export type AcceptanceCriterion =
  | {
      readonly id: NonEmptyString;
      readonly kind: "must-have";
      readonly description: NonEmptyString;
      readonly check: CriterionCheck;
    }
  | {
      readonly id: NonEmptyString;
      readonly kind: "should-have";
      readonly description: NonEmptyString;
      readonly check: CriterionCheck;
      readonly partialFloor: number;
    };

/** Qualification metadata — scope, budget, deadline, acceptance. */
export interface QualificationMetadata {
  readonly scope: TaskScope;
  readonly budget: TaskBudget;
  readonly deadlineAt: Iso8601;
  readonly acceptance: readonly AcceptanceCriterion[];
  readonly requiredExpertise: readonly ExpertiseRequirement[];
}

/** The structured task package handed to the Arena. */
export interface ArenaTaskPackage {
  readonly schemaVersion: "1";
  readonly taskPackageId: NonEmptyString;
  readonly createdAt: Iso8601;
  readonly gapRefs: readonly GapRef[];
  readonly evidence: readonly EvidenceExport[];
  readonly qualification: QualificationMetadata;
  readonly digest: Hex64;
}

/** Acceptance side of verification, derived from qualification. */
export interface AcceptanceSpec {
  readonly expectedTaskPackageDigest: Hex64;
  readonly deadlineAt: Iso8601;
  readonly criteria: readonly AcceptanceCriterion[];
}
