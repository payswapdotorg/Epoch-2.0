import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * SIMULATED workflow trace (W029 task 6). Everything in this file is a
 * clearly labeled simulation: no real user, no real environment, and the
 * "world revision" is a simulated artifact that stands in for a revision
 * produced by another lane. The test verifies correlation BY DIGEST and
 * the absence of any mutation path.
 */

import {
  bindWorldStore,
  buildCandidateExport,
  buildDemonstration,
  candidateDigest,
  createSessionRecorder,
  defineEpisode,
  digestRecord,
  makeCapturePolicy,
} from "../src/index.js";

const session = { sessionId: "SIMULATED-session-1", environmentId: "SIMULATED-env-1" };

function simulatedWorldRevision(): Record<string, unknown> {
  return {
    type: "SIMULATED-world-revision",
    label: "SIMULATED",
    elements: [
      { id: "wall-1", height: 3.2 },
      { id: "wall-2", height: 3.2 },
    ],
  };
}

function simulatedPolicy() {
  return makeCapturePolicy({
    policyId: "pol-sim",
    subject: "sim-user",
    environmentId: "SIMULATED-env-1",
    scope: {
      includedEventKinds: ["*"],
      excludedEventKinds: ["input.key"],
      includedInitiators: ["human", "agent", "application"],
    },
    consent: { consentId: "c-sim", subject: "sim-user", state: "granted" },
    retention: { allowed: true },
    reuse: { allowed: true, projects: ["*"] },
  });
}

function buildSimulatedPipeline(): {
  revisionDigest: string;
  demonstration: ReturnType<typeof buildDemonstration>;
  candidate: ReturnType<typeof buildCandidateExport>;
} {
  const revision = simulatedWorldRevision();
  const revisionDigest = digestRecord(revision);
  const recorder = createSessionRecorder({ session, policies: [simulatedPolicy()] });
  recorder.record({
    kind: "session.opened",
    initiator: "human",
    payload: { note: "SIMULATED session start" },
  });
  recorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: { command: "wall.create", args: { height: 3.2 }, label: "SIMULATED" },
    correlations: [
      { role: "input", kind: "artifact", digest: digestRecord({ type: "SIMULATED-input" }) },
    ],
  });
  recorder.beginSensitiveWindow("SIMULATED screen share with personal content");
  recorder.record({
    kind: "view.changed",
    initiator: "human",
    payload: { camera: "SIMULATED-personal-camera" },
  });
  recorder.endSensitiveWindow();
  recorder.pause();
  recorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: { command: "SIMULATED-ignored-while-paused" },
  });
  recorder.resume();
  recorder.record({
    kind: "tool.applied",
    initiator: "agent",
    payload: { tool: "wall.place", label: "SIMULATED" },
  });
  recorder.record({
    kind: "world.revision.committed",
    initiator: "application",
    payload: { note: "SIMULATED revision commit" },
    correlations: [
      {
        role: "result",
        kind: "world-revision",
        digest: revisionDigest,
        label: "SIMULATED resulting world revision",
      },
    ],
  });
  const journal = recorder.snapshot();
  const episode = defineEpisode({
    episodeId: "ep-sim-1",
    session,
    records: [...journal.records],
    title: "SIMULATED wall placement episode",
    userIntent: "Place two walls and commit a revision",
    inferredIntent: "The user is modeling a rectangular room",
    inferredIntentBasis: "two wall.create commands followed by wall.place",
    sessionLength: journal.records.length,
  });
  const demonstration = buildDemonstration({
    demonstrationId: "demo-sim-1",
    title: "SIMULATED wall placement workflow",
    episodes: [episode],
    narrativeSteps: [
      {
        stepId: "step-1",
        ordinal: 1,
        description: "SIMULATED: the user opens the session",
        episodeId: "ep-sim-1",
        sequence: 1,
      },
      {
        stepId: "step-2",
        ordinal: 2,
        description: "SIMULATED: the user creates walls; the agent places them; a revision is committed",
        episodeId: "ep-sim-1",
        sequence: journal.records.length,
      },
    ],
    resultCorrelations: [
      {
        role: "result",
        kind: "world-revision",
        digest: revisionDigest,
        label: "SIMULATED resulting world revision",
      },
    ],
    boundary: {
      covers: ["the SIMULATED command sequence that produced the revision"],
      doesNotCover: [
        "anything outside the SIMULATED session",
        "the semantic correctness of the SIMULATED revision",
        "the redacted sensitive window content (withheld by design)",
      ],
      openQuestions: ["did the paused window hide relevant SIMULATED commands?"],
    },
  });
  const candidate = buildCandidateExport({
    exportId: "cand-sim-1",
    demonstration,
    policies: [simulatedPolicy()],
    originProject: "proj-SIM",
    targetProject: "proj-SIM",
    preparedBy: "w029-workflow-simulation-test",
    notes: ["SIMULATED workflow — not real user activity"],
  });
  return { revisionDigest, demonstration, candidate };
}

test("SIMULATED workflow trace correlates episodes with a resulting world revision by digest", () => {
  const { revisionDigest, demonstration } = buildSimulatedPipeline();
  const revision = simulatedWorldRevision();
  assert.equal(digestRecord(revision), revisionDigest);
  assert.equal(demonstration.resultCorrelations[0].digest, revisionDigest);
  assert.equal(demonstration.resultCorrelations[0].kind, "world-revision");
  // No-authority law: the simulated revision object was never mutated by the
  // activity pipeline — correlation is by digest reference only.
  assert.deepEqual(revision, simulatedWorldRevision());
  // The correlated event inside the episode references the same digest.
  const committed = demonstration.episodes[0].records.find(
    (record) =>
      record.type === "environment-event" && record.kind === "world.revision.committed",
  );
  assert.ok(committed !== undefined);
  assert.equal(
    (committed as { correlations: { digest: string }[] }).correlations[0].digest,
    revisionDigest,
  );
});

test("the SIMULATED demonstration reports incomplete coverage honestly", () => {
  const { demonstration, candidate } = buildSimulatedPipeline();
  assert.equal(demonstration.coverage.status, "incomplete");
  assert.deepEqual(demonstration.coverage.partialEpisodeIds, ["ep-sim-1"]);
  assert.ok(demonstration.coverage.reasons.some((reason) => reason.includes("gap markers")));
  assert.ok(
    demonstration.coverage.reasons.some((reason) => reason.includes("redaction markers")),
  );
  assert.ok(demonstration.boundary.doesNotCover.length > 0);
  assert.equal(candidate.provenance.coverage.status, "incomplete");
  assert.equal(candidate.status, "unverified-candidate");
  const journalJson = JSON.stringify(demonstration);
  assert.ok(!journalJson.includes("SIMULATED-personal-camera"));
  assert.ok(!journalJson.includes("SIMULATED-ignored-while-paused"));
});

test("the SIMULATED candidate export persists and restores by digest", async () => {
  const { candidate } = buildSimulatedPipeline();
  const entries = new Map<string, unknown>();
  const binding = bindWorldStore({
    put: async (envelope) => {
      entries.set(envelope.digest, envelope);
    },
    get: async (digest) =>
      (entries.get(digest) as never) ?? null,
  });
  const digest = await binding.saveCandidateExport(candidate);
  assert.equal(digest, candidateDigest(candidate));
  const restored = await binding.restoreCandidateExport(digest);
  assert.deepEqual(restored, candidate);
  assert.equal(restored.status, "unverified-candidate");
  assert.equal(restored.provenance.coverage.status, "incomplete");
});
