import { digestRecord, isValidDigest } from "./hashing.js";
import { authorizeReuse } from "./reuse.js";
import type { ReuseContext, ReuseDecision } from "./reuse.js";
import { candidateIdentity } from "./candidates.js";
import type { LearningCandidate } from "./candidates.js";
import type { HumanIntervention } from "./refs.js";
import { AUTONOMY_LADDER } from "./autonomy.js";
import type {
  ApprovalBasisKind,
  AutonomyLevel,
  AutonomyLevelDescriptor,
  PromotionBasis,
} from "./autonomy.js";
import type { RollbackPlan, RollbackMetadata } from "./rollback.js";

/**
 * Human-in-the-loop promotion law (W032 §5).
 *
 * `proposePromotion` records a human proposal and NEVER promotes: proposals
 * are terminal data (status stays "proposed"). Only `approvePromotion` —
 * with a typed approval record from a human actor distinct from the proposer
 * — yields a promotion record. Rollback metadata travels with every
 * promotion and is advisory only.
 */

export type PermittedReuseDecision = Extract<ReuseDecision, { kind: "permitted" }>;

export interface PromotionProposalInput {
  readonly candidate: LearningCandidate;
  readonly proposedLevel: AutonomyLevel;
  readonly currentLevel: AutonomyLevel | null;
  readonly proposedBy: HumanIntervention;
  readonly basis: PromotionBasis;
  readonly rollbackPlan: RollbackPlan | null;
  readonly reuseContext: ReuseContext;
}

export type ProposalRefusal =
  | "unknown-autonomy-level"
  | "missing-proposer-intervention"
  | "candidate-rejected"
  | "candidate-generalization-pending"
  | "reuse-permission-denied"
  | "autonomy-level-skipped"
  | "rollback-plan-required"
  | "invalid-basis";

export type PromotionProposalResult =
  | { readonly kind: "proposed"; readonly proposal: PromotionProposal }
  | {
      readonly kind: "refused";
      readonly reason: ProposalRefusal;
      readonly detail: string;
    };

/** A human proposal. Terminal: nothing in this package advances it automatically. */
export interface PromotionProposal {
  readonly proposalId: string;
  readonly candidate: ReturnType<typeof candidateIdentity>;
  readonly proposedLevel: AutonomyLevel;
  readonly currentLevel: AutonomyLevel | null;
  readonly proposedBy: HumanIntervention;
  readonly basis: PromotionBasis;
  readonly rollback: RollbackPlan;
  readonly reuseDecision: PermittedReuseDecision;
  readonly status: "proposed";
}

/**
 * Refusal precedence: unknown level → proposer validity → candidate gates →
 * reuse enforcement → ladder (one rung at a time) → rollback plan → basis.
 */
export function proposePromotion(input: PromotionProposalInput): PromotionProposalResult {
  const descriptor = ladderDescriptor(input.proposedLevel);
  if (descriptor === undefined) {
    return {
      kind: "refused",
      reason: "unknown-autonomy-level",
      detail: `"${input.proposedLevel}" is not on the autonomy ladder`,
    };
  }
  if (!isValidHumanIntervention(input.proposedBy)) {
    return {
      kind: "refused",
      reason: "missing-proposer-intervention",
      detail: "proposals require a typed human intervention (actor, role, digest)",
    };
  }
  const generalization = input.candidate.generalization.kind;
  if (generalization === "rejected") {
    return {
      kind: "refused",
      reason: "candidate-rejected",
      detail: "a rejected candidate cannot be proposed for promotion",
    };
  }
  if (generalization === "pending") {
    return {
      kind: "refused",
      reason: "candidate-generalization-pending",
      detail: "promotion requires a passed held-out replay validation first",
    };
  }
  const reuseDecision = authorizeReuse(input.candidate, {
    right: "promote-to-capability",
    context: input.reuseContext,
  });
  if (reuseDecision.kind === "denied") {
    return { kind: "refused", reason: "reuse-permission-denied", detail: reuseDecision.detail };
  }
  const currentRung = rungOf(input.currentLevel);
  if (currentRung === null) {
    return {
      kind: "refused",
      reason: "unknown-autonomy-level",
      detail: "current level is not on the autonomy ladder",
    };
  }
  if (descriptor.rung > currentRung + 1) {
    return {
      kind: "refused",
      reason: "autonomy-level-skipped",
      detail: "promotion climbs the autonomy ladder one rung at a time",
    };
  }
  const rollbackPlan = input.rollbackPlan;
  if (rollbackPlan === null) {
    return {
      kind: "refused",
      reason: "rollback-plan-required",
      detail: "every promotion proposal must carry a rollback plan",
    };
  }
  const basisIssue = validateBasis(input.basis, descriptor.requiredBasis);
  if (basisIssue !== null) {
    return { kind: "refused", reason: "invalid-basis", detail: basisIssue };
  }
  const core = {
    candidate: candidateIdentity(input.candidate),
    proposedLevel: input.proposedLevel,
    currentLevel: input.currentLevel,
    proposedBy: input.proposedBy,
    basis: input.basis,
    rollback: rollbackPlan,
    reuseDecision,
  };
  return {
    kind: "proposed",
    proposal: {
      proposalId: digestRecord("promotion-proposal", core),
      ...core,
      status: "proposed",
    },
  };
}

/** Typed approval record: who approved, on what basis, for which proposal. */
export interface ApprovalRecord {
  readonly proposalId: string;
  readonly approver: HumanIntervention;
  readonly basis: PromotionBasis;
  readonly replaces: string | null;
  readonly epochRef: string;
}

export type ApprovalRefusal =
  | "proposal-digest-mismatch"
  | "invalid-approver"
  | "approver-is-proposer"
  | "approval-basis-insufficient"
  | "invalid-replacement-reference"
  | "missing-epoch-reference"
  | "unknown-autonomy-level";

export type PromotionApprovalResult =
  | { readonly kind: "approved"; readonly promotion: PromotionRecord }
  | {
      readonly kind: "refused";
      readonly reason: ApprovalRefusal;
      readonly detail: string;
    };

/** An approved promotion: recorded data only — never executed here. */
export interface PromotionRecord {
  readonly promotionId: string;
  readonly proposal: PromotionProposal;
  readonly approval: ApprovalRecord;
  readonly rollback: RollbackMetadata;
  readonly epochRef: string;
  readonly status: "approved";
}

export function approvePromotion(
  proposal: PromotionProposal,
  approval: ApprovalRecord,
): PromotionApprovalResult {
  if (approval.proposalId !== proposal.proposalId) {
    return {
      kind: "refused",
      reason: "proposal-digest-mismatch",
      detail: "approval must reference the exact proposal digest it approves",
    };
  }
  if (!isValidHumanIntervention(approval.approver)) {
    return {
      kind: "refused",
      reason: "invalid-approver",
      detail: "approvals require a typed human intervention (actor, role, digest)",
    };
  }
  if (approval.approver.actorId === proposal.proposedBy.actorId) {
    return {
      kind: "refused",
      reason: "approver-is-proposer",
      detail: "separation of duties: the proposer cannot approve their own proposal",
    };
  }
  const descriptor = ladderDescriptor(proposal.proposedLevel);
  if (descriptor === undefined) {
    return {
      kind: "refused",
      reason: "unknown-autonomy-level",
      detail: `"${proposal.proposedLevel}" is not on the autonomy ladder`,
    };
  }
  const basisIssue = validateBasis(approval.basis, descriptor.requiredBasis);
  if (basisIssue !== null) {
    return { kind: "refused", reason: "approval-basis-insufficient", detail: basisIssue };
  }
  if (approval.replaces !== null && !isValidDigest(approval.replaces)) {
    return {
      kind: "refused",
      reason: "invalid-replacement-reference",
      detail: "replaced promotion reference must be a 64-hex digest",
    };
  }
  if (approval.epochRef.trim() === "") {
    return {
      kind: "refused",
      reason: "missing-epoch-reference",
      detail: "approvals must reference the epoch they were decided in",
    };
  }
  const rollback: RollbackMetadata = {
    plan: proposal.rollback,
    replacesPromotionId: approval.replaces,
    activation: { advisoryOnly: true, decidedBy: "human-approval" },
  };
  const core = {
    proposal,
    approval,
    rollback,
    epochRef: approval.epochRef,
    status: "approved" as const,
  };
  return {
    kind: "approved",
    promotion: { promotionId: digestRecord("promotion-record", core), ...core },
  };
}

function ladderDescriptor(level: AutonomyLevel): AutonomyLevelDescriptor | undefined {
  return AUTONOMY_LADDER.find((descriptor) => descriptor.level === level);
}

function rungOf(level: AutonomyLevel | null): number | null {
  if (level === null) {
    return -1;
  }
  const descriptor = ladderDescriptor(level);
  return descriptor === undefined ? null : descriptor.rung;
}

function validateBasis(basis: PromotionBasis, requiredKind: ApprovalBasisKind): string | null {
  if (basis.basisKind !== requiredKind) {
    return `this autonomy level requires an approval basis of kind "${requiredKind}"`;
  }
  if (
    (basis.basisKind === "measured-evidence" ||
      basis.basisKind === "measured-evidence-and-regression-history") &&
    basis.evidenceRefs.length === 0
  ) {
    return "a measured-evidence basis must reference at least one evidence digest";
  }
  if (basis.statement.trim() === "") {
    return "basis statement must not be blank";
  }
  return null;
}

function isValidHumanIntervention(intervention: HumanIntervention): boolean {
  return (
    intervention.actorId.trim() !== "" &&
    intervention.role.trim() !== "" &&
    isValidDigest(intervention.interventionDigest)
  );
}
