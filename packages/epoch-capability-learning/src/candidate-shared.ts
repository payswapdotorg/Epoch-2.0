/**
 * Shared candidate-model vocabulary (W032) — the cycle-breaker module.
 *
 * `candidates.ts`, `generalization.ts` and `reuse.ts` all need the same
 * types; defining them in this leaf module (which imports only `refs.ts`
 * types) keeps the dependency graph acyclic:
 *   candidates -> candidate-shared
 *   generalization -> candidates + candidate-shared
 *   reuse -> candidate-shared
 * Pure types plus one schema constant — no behavior, no execution authority.
 */

import type { CapabilityRef } from "./refs.js";

export const CANDIDATE_SCHEMA_VERSION: 1 = 1;

/** Verification status of the source demonstration, as recorded by W029. */
export type DemonstrationVerification = "verified" | "unverified" | "rejected";

/** Outcome classification of the source demonstration, as recorded by W029. */
export type OutcomeClassification = "success" | "partial" | "failure";

/** Digest-only references to the W029 records a candidate was learned from. */
export interface CandidateSourceRef {
  readonly exportDigest: string;
  readonly demonstrationDigest: string;
  readonly outcomeDigest: string;
  readonly episodeId: string;
  readonly verification: DemonstrationVerification;
  readonly outcome: OutcomeClassification;
}

export type BehaviorConditionKind =
  "state" | "evidence" | "capability" | "environment";

export interface BehaviorCondition {
  readonly kind: BehaviorConditionKind;
  readonly description: string;
}

export type BehaviorStepKind =
  | "observe"
  | "request-evidence"
  | "invoke-capability"
  | "act-on-environment"
  | "verify-outcome";

/** A declarative behavior step — data only, never executable. */
export interface BehaviorStep {
  readonly stepId: string;
  readonly kind: BehaviorStepKind;
  readonly description: string;
  readonly usesCapabilityId: string | null;
}

/** Caller-supplied draft of the learned behavior. */
export interface BehaviorDraft {
  readonly capability: CapabilityRef;
  readonly intent: string;
  readonly preconditions: readonly BehaviorCondition[];
  readonly steps: readonly BehaviorStep[];
  readonly postconditions: readonly BehaviorCondition[];
}

/** Digest-stamped learned behavior (data only, no execution authority). */
export interface LearnedBehavior {
  readonly behaviorDigest: string;
  readonly capability: CapabilityRef;
  readonly intent: string;
  readonly preconditions: readonly BehaviorCondition[];
  readonly steps: readonly BehaviorStep[];
  readonly postconditions: readonly BehaviorCondition[];
}

/** Identity of a learning candidate (content-addressed). */
export interface CandidateIdentity {
  readonly candidateId: string;
  readonly lineageId: string;
  readonly candidateVersion: number;
}

/** A versioned learning candidate. */
export interface LearningCandidate {
  readonly candidateId: string;
  readonly schemaVersion: typeof CANDIDATE_SCHEMA_VERSION;
  readonly lineageId: string;
  readonly candidateVersion: number;
  readonly source: CandidateSourceRef;
  readonly behavior: LearnedBehavior;
  readonly generalization: GeneralizationStatus;
  readonly reuse: ReusePolicy;
  readonly authoredBy: string;
  readonly revisedFrom: string | null;
}

export interface ScopeDimension {
  readonly dimension: string;
  readonly value: string;
}

export interface ScopeDeclaration {
  readonly dimensions: readonly ScopeDimension[];
  readonly declaredBy: string;
  readonly declarationDigest: string;
}

export type GeneralizationRejection =
  | "missing-original-case"
  | "duplicate-original-cases"
  | "original-case-mismatch"
  | "missing-held-out-representative-case"
  | "incomplete-observations"
  | "original-case-failed"
  | "original-case-inconclusive"
  | "held-out-failed-without-scope-proposal"
  | "scope-excludes-original-case"
  | "failing-case-inside-proposed-scope"
  | "scope-not-validated-on-held-out";

/** Generalization status carried by a learning candidate. */
export type GeneralizationStatus =
  | { readonly kind: "pending" }
  | {
      readonly kind: "generalized";
      readonly validatedOn: readonly string[];
      readonly validationDigest: string;
    }
  | {
      readonly kind: "scoped";
      readonly scope: ScopeDeclaration;
      readonly validationDigest: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason: GeneralizationRejection;
      readonly validationDigest: string;
    };

export type ReuseLevel = "project-local" | "organization-shared" | "public";

export type CandidateRight =
  | "reuse-in-replays"
  | "reuse-in-evaluations"
  | "derive-revisions"
  | "promote-to-capability"
  | "redistribute";

export type ReuseBasisKind =
  "demonstration-provenance" | "owner-declaration" | "governance-default";

export interface ReuseBasis {
  readonly kind: ReuseBasisKind;
  readonly detail: string;
}

export interface ReusePolicy {
  readonly policyDigest: string;
  readonly level: ReuseLevel;
  readonly rights: readonly CandidateRight[];
  readonly declaringProjectId: string;
  readonly declaringOrganizationId: string;
  readonly declaredBy: string;
  readonly basis: ReuseBasis;
}
