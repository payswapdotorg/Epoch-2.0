/**
 * Verification + proposal types.
 */
import type { Hex64, Iso8601, NonEmptyString } from "./types-core.js";
import type { AcceptanceCriterion } from "./types-task.js";
import type { ArenaReturnPackage } from "./types-return.js";

/** Deterministic outcome of one acceptance criterion. */
export interface CriterionOutcome {
  readonly criterionId: NonEmptyString;
  readonly kind: "must-have" | "should-have";
  readonly status: "met" | "partial" | "unmet";
  /** met => 1; partial => (0,1); unmet => 0. */
  readonly fraction: number;
  readonly detail: NonEmptyString;
}

/** Pure evaluator of one criterion against one return. */
export type CriterionVerifier = (
  criterion: AcceptanceCriterion,
  ret: ArenaReturnPackage,
) => CriterionOutcome;

/** All hard requirements met, all criteria fully met. */
export interface VerifiedResult {
  readonly kind: "verified";
  readonly returnDigest: Hex64;
  readonly outcomes: readonly CriterionOutcome[];
  readonly acceptanceFraction: 1;
  readonly verifiedAt: Iso8601;
}

export type PartialReason =
  | {
      readonly type: "should-have-partial";
      readonly criterionId: NonEmptyString;
      readonly fraction: number;
      readonly floor: number;
      readonly meetsFloor: boolean;
    }
  | {
      readonly type: "should-have-unmet";
      readonly criterionId: NonEmptyString;
    };

/**
 * Partial result: no hard requirement failed, but at least one
 * should-have is partial or unmet. `acceptable` is true iff every
 * should-have is either met or partial with fraction >= partialFloor.
 */
export interface PartialResult {
  readonly kind: "partial";
  readonly returnDigest: Hex64;
  readonly met: readonly CriterionOutcome[];
  readonly partial: readonly CriterionOutcome[];
  readonly unmet: readonly CriterionOutcome[];
  readonly acceptanceFraction: number;
  readonly acceptable: boolean;
  readonly reasons: readonly PartialReason[];
  readonly verifiedAt: Iso8601;
}

export type RejectionReason =
  | {
      readonly type: "must-have-unmet";
      readonly criterionId: NonEmptyString;
      readonly detail: NonEmptyString;
    }
  | {
      readonly type: "digest-mismatch";
      readonly field: "digest";
      readonly expected: Hex64;
      readonly actual: Hex64;
    }
  | {
      readonly type: "task-package-mismatch";
      readonly expected: Hex64;
      readonly actual: Hex64;
    }
  | {
      readonly type: "schema-version-unsupported";
      readonly supported: "1";
      readonly actual: string;
    }
  | { readonly type: "no-deliverables" }
  | { readonly type: "invalid-declaration"; readonly detail: NonEmptyString }
  | { readonly type: "invalid-confidence"; readonly value: number }
  | {
      readonly type: "late-submission";
      readonly deadline: Iso8601;
      readonly submittedAt: Iso8601;
    };

/** Rejected return with typed reasons. */
export interface RejectedResult {
  readonly kind: "rejected";
  readonly returnDigest: Hex64;
  readonly reasons: readonly RejectionReason[];
  readonly verifiedAt: Iso8601;
}

export type ReturnVerification =
  | VerifiedResult
  | PartialResult
  | RejectedResult;

/** A canonical world change — data only, executed by NOBODY here. */
export type WorldChange =
  | {
      readonly changeKind: "link-capability-gap";
      readonly gapId: NonEmptyString;
      readonly gapDigest: Hex64;
      readonly note: NonEmptyString;
    }
  | {
      readonly changeKind: "record-demonstration";
      readonly demonstrationDigest: Hex64;
      readonly note: NonEmptyString;
    }
  | {
      readonly changeKind: "append-knowledge";
      readonly topic: NonEmptyString;
      readonly content: NonEmptyString;
    }
  | {
      readonly changeKind: "propose-promotion";
      readonly gapId: NonEmptyString;
      readonly gapDigest: Hex64;
      readonly promotionNote: NonEmptyString;
    };

/**
 * Canonical world-change proposal. Flows to the world/verification
 * authority — this adapter never writes world state.
 */
export interface WorldRevisionProposal {
  readonly schemaVersion: "1";
  readonly proposalId: NonEmptyString;
  readonly createdAt: Iso8601;
  readonly summary: NonEmptyString;
  readonly basedOn: {
    readonly taskPackageDigest: Hex64;
    readonly returnDigest: Hex64;
    readonly outcome: "verified" | "partial";
    readonly acceptanceFraction: number;
  };
  readonly changes: readonly WorldChange[];
  readonly digest: Hex64;
}

export type ProposalBlockedReason =
  | { readonly type: "return-rejected"; readonly returnDigest: Hex64 }
  | {
      readonly type: "partial-not-acceptable";
      readonly returnDigest: Hex64;
      readonly acceptanceFraction: number;
    };

export type WorldRevisionProposalResult =
  | { readonly ok: true; readonly proposal: WorldRevisionProposal }
  | { readonly ok: false; readonly blocked: readonly ProposalBlockedReason[] };
