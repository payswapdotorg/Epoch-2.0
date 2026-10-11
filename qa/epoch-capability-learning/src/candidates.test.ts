import { test } from "node:test";
import { ok, strictEqual } from "node:assert";
import {
  extractLearningCandidate,
  reviseCandidate,
} from "../../packages/epoch-capability-learning/dist/index.js";
import type {
  BehaviorDraft,
  CandidateSourceRef,
  DemonstrationVerification,
} from "../../packages/epoch-capability-learning/dist/index.js";
import { draftBehavior, hex, makeCandidate, projectPolicy } from "./helpers.js";

function verifiedSource(): CandidateSourceRef {
  return {
    exportDigest: hex("w029-export-001"),
    demonstrationDigest: hex("w029-demo-001"),
    outcomeDigest: hex("w029-outcome-001"),
    episodeId: "ep-001",
    verification: "verified",
    outcome: "success",
  };
}

function extract(verification: DemonstrationVerification) {
  return extractLearningCandidate({
    source: { ...verifiedSource(), verification },
    behavior: draftBehavior(),
    reuse: projectPolicy(),
    authoredBy: "human/alice",
  });
}

function extendedBehavior(): BehaviorDraft {
  const behavior = draftBehavior();
  return {
    ...behavior,
    steps: [
      ...behavior.steps,
      {
        stepId: "step/report",
        kind: "verify-outcome",
        description: "report the verified outcome",
        usesCapabilityId: null,
      },
    ],
  };
}

test("extracts a version-1 candidate from a verified demonstration", () => {
  const result = extract("verified");
  ok(result.kind === "extracted");
  const candidate = result.candidate;
  strictEqual(candidate.schemaVersion, 1);
  strictEqual(candidate.candidateVersion, 1);
  strictEqual(candidate.revisedFrom, null);
  strictEqual(candidate.generalization.kind, "pending");
  ok(/^[0-9a-f]{64}$/.test(candidate.candidateId));
  ok(/^[0-9a-f]{64}$/.test(candidate.lineageId));
  ok(/^[0-9a-f]{64}$/.test(candidate.behavior.behaviorDigest));
  strictEqual(candidate.source.demonstrationDigest, hex("w029-demo-001"));
});

test("rejects extraction from unverified or rejected demonstrations", () => {
  for (const verification of ["unverified", "rejected"] as const) {
    const result = extract(verification);
    ok(result.kind === "rejected");
    strictEqual(result.reason, "demonstration-not-verified");
  }
});

test("rejects malformed source digests", () => {
  const result = extractLearningCandidate({
    source: { ...verifiedSource(), demonstrationDigest: "short" },
    behavior: draftBehavior(),
    reuse: projectPolicy(),
    authoredBy: "human/alice",
  });
  ok(result.kind === "rejected");
  strictEqual(result.reason, "invalid-source-reference");
});

test("rejects an invalid capability reference", () => {
  const behavior = draftBehavior();
  const result = extractLearningCandidate({
    source: verifiedSource(),
    behavior: {
      ...behavior,
      capability: { capabilityId: "cap/alpha", capabilityDigest: "short" },
    },
    reuse: projectPolicy(),
    authoredBy: "human/alice",
  });
  ok(result.kind === "rejected");
  strictEqual(result.reason, "invalid-capability-reference");
});

test("rejects a blank intent", () => {
  const behavior = draftBehavior();
  const result = extractLearningCandidate({
    source: verifiedSource(),
    behavior: { ...behavior, intent: "   " },
    reuse: projectPolicy(),
    authoredBy: "human/alice",
  });
  ok(result.kind === "rejected");
  strictEqual(result.reason, "empty-intent");
});

test("rejects duplicate step ids", () => {
  const behavior = draftBehavior();
  const [first] = behavior.steps;
  ok(first !== undefined);
  const result = extractLearningCandidate({
    source: verifiedSource(),
    behavior: { ...behavior, steps: [...behavior.steps, first] },
    reuse: projectPolicy(),
    authoredBy: "human/alice",
  });
  ok(result.kind === "rejected");
  strictEqual(result.reason, "duplicate-step-ids");
});

test("rejects a missing author", () => {
  const result = extractLearningCandidate({
    source: verifiedSource(),
    behavior: draftBehavior(),
    reuse: projectPolicy(),
    authoredBy: " ",
  });
  ok(result.kind === "rejected");
  strictEqual(result.reason, "missing-author");
});

test("revision bumps the version, preserves the lineage and resets generalization", () => {
  const prior = makeCandidate();
  const revision = reviseCandidate({
    prior,
    behavior: extendedBehavior(),
    revisionNote: "added an explicit reporting step after replay failures",
    authoredBy: "human/alice",
    reuse: projectPolicy(),
  });
  ok(revision.kind === "revised");
  const candidate = revision.candidate;
  strictEqual(candidate.candidateVersion, 2);
  strictEqual(candidate.lineageId, prior.lineageId);
  strictEqual(candidate.revisedFrom, prior.candidateId);
  strictEqual(candidate.generalization.kind, "pending");
  ok(candidate.candidateId !== prior.candidateId);
});

test("revision requires the derive-revisions right", () => {
  const policy = projectPolicy();
  const restricted = {
    ...policy,
    rights: policy.rights.filter((right) => right !== "derive-revisions"),
  };
  const revision = reviseCandidate({
    prior: { ...makeCandidate(), reuse: restricted },
    behavior: extendedBehavior(),
    revisionNote: "tighten postconditions",
    authoredBy: "human/alice",
    reuse: projectPolicy(),
  });
  ok(revision.kind === "rejected");
  strictEqual(revision.reason, "reuse-permission-denied");
});

test("revision refuses an unchanged behavior", () => {
  const revision = reviseCandidate({
    prior: makeCandidate(),
    behavior: draftBehavior(),
    revisionNote: "no functional change",
    authoredBy: "human/alice",
    reuse: projectPolicy(),
  });
  ok(revision.kind === "rejected");
  strictEqual(revision.reason, "behavior-unchanged");
});

test("revision refuses an empty revision note", () => {
  const revision = reviseCandidate({
    prior: makeCandidate(),
    behavior: extendedBehavior(),
    revisionNote: " ",
    authoredBy: "human/alice",
    reuse: projectPolicy(),
  });
  ok(revision.kind === "rejected");
  strictEqual(revision.reason, "empty-revision-note");
});
