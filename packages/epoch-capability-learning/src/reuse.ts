import { digestRecord } from "./hashing.js";
import type {
  CandidateRight,
  LearningCandidate,
  ReuseBasis,
  ReuseLevel,
  ReusePolicy,
} from "./candidate-shared.js";

/**
 * Reuse permissions (W032 §4).
 *
 * Every reuse of a learning candidate is controlled by a typed `ReusePolicy`:
 * a level (project-local / organization-shared / public — each with a
 * declared rights envelope), a set of declared rights within that envelope,
 * and the reuse context. `authorizeReuse` is the single enforcement point.
 *
 * The shared reuse vocabulary (ReuseLevel, CandidateRight, ReusePolicy, …)
 * lives in `./candidate-shared.ts`; this module imports nothing from
 * `./candidates.ts` — the dependency graph stays acyclic.
 */

/** Rights declared by each reuse level (data). A policy may declare only a subset of its level's envelope. */
export const REUSE_LEVEL_RIGHTS: Readonly<
  Record<ReuseLevel, readonly CandidateRight[]>
> = {
  "project-local": [
    "reuse-in-replays",
    "derive-revisions",
    "promote-to-capability",
  ],
  "organization-shared": [
    "reuse-in-replays",
    "reuse-in-evaluations",
    "derive-revisions",
    "promote-to-capability",
  ],
  public: [
    "reuse-in-replays",
    "reuse-in-evaluations",
    "derive-revisions",
    "promote-to-capability",
    "redistribute",
  ],
};

export const ALL_CANDIDATE_RIGHTS: readonly CandidateRight[] =
  REUSE_LEVEL_RIGHTS.public;

export interface ReusePolicyDraft {
  readonly level: ReuseLevel;
  readonly rights: readonly CandidateRight[];
  readonly declaringProjectId: string;
  readonly declaringOrganizationId: string;
  readonly declaredBy: string;
  readonly basis: ReuseBasis;
}

export type ReusePolicyRejection =
  | "right-exceeds-level-envelope"
  | "duplicate-rights"
  | "missing-identifiers"
  | "missing-declarer"
  | "missing-basis";

export type ReusePolicyDefinition =
  | { readonly kind: "defined"; readonly policy: ReusePolicy }
  | {
      readonly kind: "rejected";
      readonly reason: ReusePolicyRejection;
      readonly detail: string;
    };

export function defineReusePolicy(
  draft: ReusePolicyDraft,
): ReusePolicyDefinition {
  const envelope = REUSE_LEVEL_RIGHTS[draft.level];
  for (const right of draft.rights) {
    if (!envelope.includes(right)) {
      return {
        kind: "rejected",
        reason: "right-exceeds-level-envelope",
        detail: `right "${right}" is not within the declared rights of reuse level "${draft.level}"`,
      };
    }
  }
  const seen = new Set<CandidateRight>();
  for (const right of draft.rights) {
    if (seen.has(right)) {
      return {
        kind: "rejected",
        reason: "duplicate-rights",
        detail: `right "${right}" is declared more than once`,
      };
    }
    seen.add(right);
  }
  if (
    draft.declaringProjectId.trim() === "" ||
    draft.declaringOrganizationId.trim() === ""
  ) {
    return {
      kind: "rejected",
      reason: "missing-identifiers",
      detail: "declaring project and organization ids must be stated",
    };
  }
  if (draft.declaredBy.trim() === "") {
    return {
      kind: "rejected",
      reason: "missing-declarer",
      detail: "declaring actor must be identified",
    };
  }
  if (draft.basis.detail.trim() === "") {
    return {
      kind: "rejected",
      reason: "missing-basis",
      detail: "reuse basis must state its provenance",
    };
  }
  const core = {
    level: draft.level,
    rights: [...draft.rights],
    declaringProjectId: draft.declaringProjectId,
    declaringOrganizationId: draft.declaringOrganizationId,
    declaredBy: draft.declaredBy,
    basis: draft.basis,
  };
  return {
    kind: "defined",
    policy: { ...core, policyDigest: digestRecord("reuse-policy", core) },
  };
}

export type ReuseContextKind = "project" | "organization" | "public";

export interface ReuseContext {
  readonly kind: ReuseContextKind;
  readonly projectId: string;
  readonly organizationId: string;
}

export interface ReuseRequest {
  readonly right: CandidateRight;
  readonly context: ReuseContext;
}

export type ReuseDenial =
  | "right-not-declared"
  | "context-outside-policy-level"
  | "candidate-rejected"
  | "candidate-generalization-pending";

export type ReuseDecision =
  | {
      readonly kind: "permitted";
      readonly right: CandidateRight;
      readonly level: ReuseLevel;
      readonly policyDigest: string;
    }
  | {
      readonly kind: "denied";
      readonly reason: ReuseDenial;
      readonly detail: string;
      readonly policyDigest: string;
    };

/** The single typed enforcement point for ALL reuse of a learning candidate. */
export function authorizeReuse(
  candidate: LearningCandidate,
  request: ReuseRequest,
): ReuseDecision {
  const policy = candidate.reuse;
  const deny = (reason: ReuseDenial, detail: string): ReuseDecision => ({
    kind: "denied",
    reason,
    detail,
    policyDigest: policy.policyDigest,
  });
  if (!policy.rights.includes(request.right)) {
    return deny(
      "right-not-declared",
      `reuse policy does not declare the "${request.right}" right`,
    );
  }
  if (!contextContained(policy, request.context)) {
    return deny(
      "context-outside-policy-level",
      `reuse context (${request.context.kind}) is outside the "${policy.level}" reuse level`,
    );
  }
  const generalization = candidate.generalization.kind;
  if (generalization === "rejected" && request.right !== "derive-revisions") {
    return deny(
      "candidate-rejected",
      "a rejected candidate may only be reused to derive revisions",
    );
  }
  if (
    request.right === "promote-to-capability" &&
    generalization === "pending"
  ) {
    return deny(
      "candidate-generalization-pending",
      "promotion requires a generalization validation (generalized or explicitly scoped)",
    );
  }
  return {
    kind: "permitted",
    right: request.right,
    level: policy.level,
    policyDigest: policy.policyDigest,
  };
}

function contextContained(policy: ReusePolicy, context: ReuseContext): boolean {
  switch (policy.level) {
    case "project-local":
      return (
        context.kind === "project" &&
        context.projectId === policy.declaringProjectId &&
        context.organizationId === policy.declaringOrganizationId
      );
    case "organization-shared":
      return (
        (context.kind === "project" || context.kind === "organization") &&
        context.organizationId === policy.declaringOrganizationId
      );
    case "public":
      return true;
  }
}
