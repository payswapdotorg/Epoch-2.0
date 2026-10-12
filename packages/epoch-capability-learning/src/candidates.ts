import { digestRecord, isValidDigest } from "./hashing.js";
import { CANDIDATE_SCHEMA_VERSION } from "./candidate-shared.js";
import type {
  BehaviorDraft,
  CandidateIdentity,
  CandidateSourceRef,
  DemonstrationVerification,
  LearnedBehavior,
  LearningCandidate,
  ReusePolicy,
} from "./candidate-shared.js";

/**
 * Learning-candidate extraction + versioning (W032 §2).
 *
 * Candidates are extracted ONLY from verified W029 demonstrations plus their
 * outcome records, referenced by digest — the demonstration content is never
 * re-embedded or re-interpreted here (W029 stays the semantic authority).
 * Candidates are content-addressed and versioned per lineage; every revision
 * resets generalization to `pending` and must be re-validated.
 *
 * The candidate-model vocabulary (LearningCandidate, GeneralizationStatus,
 * ReusePolicy, behavior drafts, …) lives in `./candidate-shared.ts`, so this
 * module imports nothing from `generalization.ts` or `reuse.ts` — the
 * dependency graph stays acyclic.
 */

export function candidateIdentity(candidate: LearningCandidate): CandidateIdentity {
  return {
    candidateId: candidate.candidateId,
    lineageId: candidate.lineageId,
    candidateVersion: candidate.candidateVersion,
  };
}

export interface CandidateExtractionInput {
  readonly source: CandidateSourceRef;
  readonly behavior: BehaviorDraft;
  readonly reuse: ReusePolicy;
  readonly authoredBy: string;
}

export type LearningExtraction =
  | { readonly kind: "extracted"; readonly candidate: LearningCandidate }
  | {
      readonly kind: "rejected";
      readonly reason: LearningExtractionRejection;
      readonly detail: string;
    };

export type LearningExtractionRejection =
  | "demonstration-not-verified"
  | "invalid-source-reference"
  | "invalid-capability-reference"
  | "empty-intent"
  | "empty-behavior-steps"
  | "duplicate-step-ids"
  | "missing-author";

export function extractLearningCandidate(input: CandidateExtractionInput): LearningExtraction {
  const sourceIssue = validateSourceRef(input.source);
  if (sourceIssue !== null) {
    return { kind: "rejected", reason: "invalid-source-reference", detail: sourceIssue };
  }
  if (input.source.verification !== "verified") {
    return {
      kind: "rejected",
      reason: "demonstration-not-verified",
      detail: `demonstration verification status is "${input.source.verification}"; candidates may only be extracted from verified W029 demonstrations`,
    };
  }
  const behaviorIssue = validateBehavior(input.behavior);
  if (behaviorIssue !== null) {
    return { kind: "rejected", reason: behaviorIssue.reason, detail: behaviorIssue.detail };
  }
  if (input.authoredBy.trim() === "") {
    return {
      kind: "rejected",
      reason: "missing-author",
      detail: "authoring actor must be identified",
    };
  }
  const behavior = sealBehavior(input.behavior);
  const lineageId = digestRecord("candidate-lineage", {
    demonstrationDigest: input.source.demonstrationDigest,
    outcomeDigest: input.source.outcomeDigest,
    behaviorDigest: behavior.behaviorDigest,
  });
  const core: Omit<LearningCandidate, "candidateId"> = {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    lineageId,
    candidateVersion: 1,
    source: input.source,
    behavior,
    generalization: { kind: "pending" },
    reuse: input.reuse,
    authoredBy: input.authoredBy,
    revisedFrom: null,
  };
  return {
    kind: "extracted",
    candidate: { candidateId: computeCandidateId(core), ...core },
  };
}

/** Content digest of a candidate core (used to derive `candidateId`). */
export function computeCandidateId(core: Omit<LearningCandidate, "candidateId">): string {
  return digestRecord("learning-candidate", core);
}

export interface CandidateRevisionInput {
  readonly prior: LearningCandidate;
  readonly behavior: BehaviorDraft;
  readonly revisionNote: string;
  readonly authoredBy: string;
  readonly reuse: ReusePolicy;
}

export type CandidateRevision =
  | { readonly kind: "revised"; readonly candidate: LearningCandidate }
  | {
      readonly kind: "rejected";
      readonly reason: CandidateRevisionRejection;
      readonly detail: string;
    };

export type CandidateRevisionRejection =
  | "reuse-permission-denied"
  | "behavior-unchanged"
  | "invalid-behavior"
  | "empty-revision-note"
  | "missing-author";

export function reviseCandidate(input: CandidateRevisionInput): CandidateRevision {
  if (!input.prior.reuse.rights.includes("derive-revisions")) {
    return {
      kind: "rejected",
      reason: "reuse-permission-denied",
      detail: 'prior candidate reuse policy does not declare the "derive-revisions" right',
    };
  }
  if (input.revisionNote.trim() === "") {
    return {
      kind: "rejected",
      reason: "empty-revision-note",
      detail: "a revision must state what changed and why",
    };
  }
  if (input.authoredBy.trim() === "") {
    return {
      kind: "rejected",
      reason: "missing-author",
      detail: "authoring actor must be identified",
    };
  }
  const behaviorIssue = validateBehavior(input.behavior);
  if (behaviorIssue !== null) {
    return { kind: "rejected", reason: "invalid-behavior", detail: behaviorIssue.detail };
  }
  const behavior = sealBehavior(input.behavior);
  if (behavior.behaviorDigest === input.prior.behavior.behaviorDigest) {
    return {
      kind: "rejected",
      reason: "behavior-unchanged",
      detail: "revision must change the behavior; keep the prior candidate otherwise",
    };
  }
  const core: Omit<LearningCandidate, "candidateId"> = {
    schemaVersion: input.prior.schemaVersion,
    lineageId: input.prior.lineageId,
    candidateVersion: input.prior.candidateVersion + 1,
    source: input.prior.source,
    behavior,
    generalization: { kind: "pending" },
    reuse: input.reuse,
    authoredBy: input.authoredBy,
    revisedFrom: input.prior.candidateId,
  };
  return {
    kind: "revised",
    candidate: { candidateId: computeCandidateId(core), ...core },
  };
}

function sealBehavior(draft: BehaviorDraft): LearnedBehavior {
  return { ...draft, behaviorDigest: digestRecord("learned-behavior", draft) };
}

type BehaviorIssue =
  | { readonly reason: "invalid-capability-reference"; readonly detail: string }
  | { readonly reason: "empty-intent"; readonly detail: string }
  | { readonly reason: "empty-behavior-steps"; readonly detail: string }
  | { readonly reason: "duplicate-step-ids"; readonly detail: string };

function validateBehavior(behavior: BehaviorDraft): BehaviorIssue | null {
  if (
    behavior.capability.capabilityId.trim() === "" ||
    !isValidDigest(behavior.capability.capabilityDigest)
  ) {
    return {
      reason: "invalid-capability-reference",
      detail: "behavior must reference a W023 capability by id and 64-hex digest",
    };
  }
  if (behavior.intent.trim() === "") {
    return { reason: "empty-intent", detail: "behavior intent must be stated" };
  }
  if (behavior.steps.length === 0) {
    return { reason: "empty-behavior-steps", detail: "behavior must declare at least one step" };
  }
  const seen = new Set<string>();
  for (const step of behavior.steps) {
    if (seen.has(step.stepId)) {
      return {
        reason: "duplicate-step-ids",
        detail: `duplicate behavior step id "${step.stepId}"`,
      };
    }
    seen.add(step.stepId);
  }
  return null;
}

function validateSourceRef(source: CandidateSourceRef): string | null {
  if (
    !isValidDigest(source.exportDigest) ||
    !isValidDigest(source.demonstrationDigest) ||
    !isValidDigest(source.outcomeDigest)
  ) {
    return "source references must be 64-hex digests (W029 export, demonstration, outcome)";
  }
  if (source.episodeId.trim() === "") {
    return "source episode id must not be blank";
  }
  return null;
}
