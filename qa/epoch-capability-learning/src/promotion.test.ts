import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import {
  approvePromotion,
  proposePromotion,
} from "../../../packages/epoch-capability-learning/dist/index.js";
import type {
  AutonomyLevel,
  HumanIntervention,
  LearningCandidate,
  PromotionBasis,
  ReuseContext,
  RollbackPlan,
} from "../../../packages/epoch-capability-learning/dist/index.js";
import {
  alice,
  bob,
  generalizingCandidate,
  hex,
  makeCandidate,
  projectContext,
  rejectedCandidate,
  rollbackPlan,
} from "./helpers.js";

const proposerBasis: PromotionBasis = {
  basisKind: "proposer-declaration",
  evidenceRefs: [],
  statement: "learned behavior replayed successfully on held-out cases",
};

const reviewBasis: PromotionBasis = {
  basisKind: "human-review",
  evidenceRefs: [],
  statement: "reviewed by a human reviewer against the replay evidence",
};

const measuredBasis: PromotionBasis = {
  basisKind: "measured-evidence",
  evidenceRefs: [hex("w030-benchmark-001")],
  statement: "measured evidence from the observation window",
};

interface ProposeOverrides {
  proposedLevel?: AutonomyLevel;
  currentLevel?: AutonomyLevel | null;
  candidate?: LearningCandidate;
  proposedBy?: HumanIntervention;
  basis?: PromotionBasis;
  rollback?: RollbackPlan | null;
  context?: ReuseContext;
}

function propose(overrides: ProposeOverrides = {}) {
  return proposePromotion({
    candidate: overrides.candidate ?? generalizingCandidate(),
    proposedLevel: overrides.proposedLevel ?? "proposal-only",
    currentLevel: overrides.currentLevel ?? null,
    proposedBy: overrides.proposedBy ?? alice,
    basis: overrides.basis ?? proposerBasis,
    rollbackPlan: overrides.rollback ?? rollbackPlan(alice),
    reuseContext: overrides.context ?? projectContext,
  });
}

test("proposes a first promotion at proposal-only and never advances it", () => {
  const result = propose({});
  ok(result.kind === "proposed");
  const proposal = result.proposal;
  strictEqual(proposal.status, "proposed");
  strictEqual(proposal.proposedLevel, "proposal-only");
  strictEqual(proposal.currentLevel, null);
  ok(/^[0-9a-f]{64}$/.test(proposal.proposalId));
  strictEqual(proposal.reuseDecision.kind, "permitted");
  ok(!("approval" in proposal));
  deepStrictEqual(result, propose({}));
});

test("refuses an unknown autonomy level", () => {
  const result = propose({ proposedLevel: "shadowed" as AutonomyLevel });
  ok(result.kind === "refused");
  strictEqual(result.reason, "unknown-autonomy-level");
});

test("refuses a proposal without a typed human intervention", () => {
  const result = propose({
    proposedBy: { actorId: "", role: "operator", interventionDigest: hex("blank-actor") },
  });
  ok(result.kind === "refused");
  strictEqual(result.reason, "missing-proposer-intervention");
});

test("refuses a rejected candidate", () => {
  const result = propose({ candidate: rejectedCandidate() });
  ok(result.kind === "refused");
  strictEqual(result.reason, "candidate-rejected");
});

test("refuses a candidate whose generalization is pending", () => {
  const result = propose({ candidate: makeCandidate() });
  ok(result.kind === "refused");
  strictEqual(result.reason, "candidate-generalization-pending");
});

test("refuses promotion when reuse is denied", () => {
  const result = propose({
    context: { kind: "project", projectId: "proj/other", organizationId: "org/zcode" },
  });
  ok(result.kind === "refused");
  strictEqual(result.reason, "reuse-permission-denied");
});

test("refuses to skip autonomy rungs", () => {
  const result = propose({ proposedLevel: "supervised", currentLevel: null });
  ok(result.kind === "refused");
  strictEqual(result.reason, "autonomy-level-skipped");
});

test("refuses a proposal without a rollback plan", () => {
  const result = propose({ rollback: null });
  ok(result.kind === "refused");
  strictEqual(result.reason, "rollback-plan-required");
});

test("refuses a basis that does not meet the level requirement", () => {
  const result = propose({
    proposedLevel: "observed",
    currentLevel: "supervised",
    basis: reviewBasis,
  });
  ok(result.kind === "refused");
  strictEqual(result.reason, "invalid-basis");
});

test("approves a proposal with a distinct human approver", () => {
  const result = propose({});
  ok(result.kind === "proposed");
  const approved = approvePromotion(result.proposal, {
    proposalId: result.proposal.proposalId,
    approver: bob,
    basis: proposerBasis,
    replaces: hex("promotion-000"),
    epochRef: "epoch-e04",
  });
  ok(approved.kind === "approved");
  const promotion = approved.promotion;
  strictEqual(promotion.status, "approved");
  ok(/^[0-9a-f]{64}$/.test(promotion.promotionId));
  strictEqual(promotion.rollback.plan, result.proposal.rollback);
  strictEqual(promotion.rollback.replacesPromotionId, hex("promotion-000"));
  strictEqual(promotion.rollback.activation.advisoryOnly, true);
  strictEqual(promotion.rollback.activation.decidedBy, "human-approval");
  strictEqual(promotion.epochRef, "epoch-e04");
});

test("refuses self-approval", () => {
  const result = propose({});
  ok(result.kind === "proposed");
  const approved = approvePromotion(result.proposal, {
    proposalId: result.proposal.proposalId,
    approver: alice,
    basis: proposerBasis,
    replaces: null,
    epochRef: "epoch-e04",
  });
  ok(approved.kind === "refused");
  strictEqual(approved.reason, "approver-is-proposer");
});

test("refuses an approval bound to a different proposal", () => {
  const result = propose({});
  ok(result.kind === "proposed");
  const approved = approvePromotion(result.proposal, {
    proposalId: hex("other-proposal"),
    approver: bob,
    basis: proposerBasis,
    replaces: null,
    epochRef: "epoch-e04",
  });
  ok(approved.kind === "refused");
  strictEqual(approved.reason, "proposal-digest-mismatch");
});

test("refuses an approval with an insufficient measured-evidence basis", () => {
  const result = propose({
    proposedLevel: "observed",
    currentLevel: "supervised",
    basis: measuredBasis,
  });
  ok(result.kind === "proposed");
  const approved = approvePromotion(result.proposal, {
    proposalId: result.proposal.proposalId,
    approver: bob,
    basis: { basisKind: "measured-evidence", evidenceRefs: [], statement: "no evidence attached" },
    replaces: null,
    epochRef: "epoch-e04",
  });
  ok(approved.kind === "refused");
  strictEqual(approved.reason, "approval-basis-insufficient");
});

test("approves a supervised promotion on a human-review basis", () => {
  const result = propose({
    proposedLevel: "supervised",
    currentLevel: "proposal-only",
    basis: reviewBasis,
  });
  ok(result.kind === "proposed");
  const approved = approvePromotion(result.proposal, {
    proposalId: result.proposal.proposalId,
    approver: bob,
    basis: reviewBasis,
    replaces: null,
    epochRef: "epoch-e05",
  });
  ok(approved.kind === "approved");
  strictEqual(approved.promotion.proposal.proposedLevel, "supervised");
});
