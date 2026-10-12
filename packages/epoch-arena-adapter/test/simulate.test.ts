import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulatedArenaEndpoint,
  runSimulatedRoundTrip,
} from "../src/simulate.js";
import { standardCriterionVerifier } from "../src/verify.js";
import {
  CLOCK,
  emptyDraft,
  goodDraft,
  makeTaskPackage,
  partialDraft,
  REUSE_POLICY,
} from "./fixtures.js";

const DEMO_DIGEST = "9a".repeat(32);

test("full round trip: accepted", () => {
  const task = makeTaskPackage();
  const transcript = runSimulatedRoundTrip({
    taskPackage: task,
    expert: goodDraft,
    verifier: standardCriterionVerifier,
    reusePolicy: REUSE_POLICY,
    clock: CLOCK,
    reuseDemonstrationDigest: DEMO_DIGEST,
  });
  assert.equal(transcript.outcome, "accepted");
  assert.equal(transcript.validation.ok, true);
  assert.equal(transcript.verification.kind, "verified");
  assert.equal(transcript.proposal.ok, true);
  assert.equal(transcript.reuseDecision.decision, "reuse-permitted");
  assert.match(transcript.simulationId, /^sim_[0-9a-f]{16}$/);
  assert.equal(transcript.taskPackageDigest, task.digest);
  assert.equal(transcript.returnPackage.provenance.arena, "simulated");
  assert.deepEqual(transcript.reuseDecision.promotionLink, {
    pipeline: "w032-capability-learning",
    gapDigest: task.gapRefs[0].capabilityGapDigest,
    status: "linked",
  });
  assert.deepEqual(transcript.reuseDecision.demonstrationLink, {
    pipeline: "w029-environment-activity",
    demonstrationDigest: DEMO_DIGEST,
    status: "linked",
  });
});

test("full round trip: rejected (empty return), reuse decision still recorded", () => {
  const task = makeTaskPackage();
  const transcript = runSimulatedRoundTrip({
    taskPackage: task,
    expert: emptyDraft,
    verifier: standardCriterionVerifier,
    reusePolicy: REUSE_POLICY,
    clock: CLOCK,
  });
  assert.equal(transcript.outcome, "rejected");
  assert.equal(transcript.validation.ok, false);
  assert.equal(transcript.verification.kind, "rejected");
  assert.equal(transcript.proposal.ok, false);
  // independence law: the reuse decision exists even for rejected returns
  assert.equal(transcript.reuseDecision.decision, "reuse-denied");
});

test("full round trip: acceptable partial", () => {
  const task = makeTaskPackage();
  const transcript = runSimulatedRoundTrip({
    taskPackage: task,
    expert: partialDraft,
    verifier: standardCriterionVerifier,
    reusePolicy: REUSE_POLICY,
    clock: CLOCK,
  });
  assert.equal(transcript.outcome, "accepted-partial");
  if (transcript.verification.kind === "partial") {
    assert.equal(transcript.verification.acceptable, true);
  }
  assert.equal(transcript.proposal.ok, true);
  if (transcript.proposal.ok) {
    assert.equal(transcript.proposal.proposal.basedOn.outcome, "partial");
    assert.equal(transcript.proposal.proposal.basedOn.acceptanceFraction, 0.75);
  }
});

test("endpoint accumulates in-memory transcripts", () => {
  const endpoint = createSimulatedArenaEndpoint({
    verifier: standardCriterionVerifier,
    reusePolicy: REUSE_POLICY,
  });
  const task = makeTaskPackage();
  const t1 = endpoint.submit({
    taskPackage: task,
    expert: goodDraft,
    clock: CLOCK,
  });
  const t2 = endpoint.submit({
    taskPackage: task,
    expert: partialDraft,
    clock: CLOCK,
  });
  assert.equal(endpoint.name, "simulated-arena");
  assert.equal(endpoint.transcripts.length, 2);
  assert.equal(endpoint.transcripts[0].digest, t1.digest);
  assert.equal(endpoint.transcripts[1].digest, t2.digest);
  assert.equal(t1.outcome, "accepted");
  assert.equal(t2.outcome, "accepted-partial");
});

test("round trips are deterministic (same digest for same inputs)", () => {
  const task = makeTaskPackage();
  const input = {
    taskPackage: task,
    expert: goodDraft,
    verifier: standardCriterionVerifier,
    reusePolicy: REUSE_POLICY,
    clock: CLOCK,
    reuseDemonstrationDigest: DEMO_DIGEST,
  };
  const a = runSimulatedRoundTrip(input);
  const b = runSimulatedRoundTrip(input);
  assert.equal(a.digest, b.digest);
  assert.equal(a.simulationId, b.simulationId);
  assert.equal(a.reuseDecision.digest, b.reuseDecision.digest);
});

test("endpoint transcripts accessor returns a defensive copy", () => {
  const endpoint = createSimulatedArenaEndpoint({
    verifier: standardCriterionVerifier,
    reusePolicy: REUSE_POLICY,
  });
  endpoint.submit({
    taskPackage: makeTaskPackage(),
    expert: goodDraft,
    clock: CLOCK,
  });
  const first = endpoint.transcripts;
  const second = endpoint.transcripts;
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notEqual(first, second);
});
