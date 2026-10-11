import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateExport,
  buildDemonstration,
  candidateDigest,
  computeEventDigest,
  computeSequenceDigest,
  createSessionRecorder,
  defineEpisode,
  demonstrationDigest,
  episodeDigest,
  journalDigest,
  makeCapturePolicy,
  makeEvent,
} from "../src/index.js";

const session = { sessionId: "s-1", environmentId: "env-1" };

function policy() {
  return makeCapturePolicy({
    policyId: "pol-1",
    subject: "user-1",
    environmentId: "env-1",
    scope: {
      includedEventKinds: ["*"],
      excludedEventKinds: [],
      includedInitiators: ["human", "agent", "application"],
    },
    consent: { consentId: "c-1", subject: "user-1", state: "granted" },
    retention: { allowed: true },
    reuse: { allowed: true, projects: ["*"] },
  });
}

function runPipeline(): {
  journal: string;
  episode: string;
  demonstration: string;
  candidate: string;
} {
  const recorder = createSessionRecorder({ session, policies: [policy()] });
  recorder.record({
    kind: "session.opened",
    initiator: "human",
    payload: { who: "u1" },
  });
  recorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: { command: "wall.create", args: { height: 3.2 } },
  });
  recorder.record({
    kind: "tool.applied",
    initiator: "agent",
    payload: { tool: "place" },
  });
  recorder.pause();
  recorder.resume();
  recorder.record({
    kind: "world.revision.committed",
    initiator: "application",
    payload: { note: "commit" },
    correlations: [
      {
        role: "result",
        kind: "world-revision",
        digest: "sha256:simulated-revision",
      },
    ],
  });
  const journal = recorder.snapshot();
  const episode = defineEpisode({
    episodeId: "ep-1",
    session,
    records: [...journal.records],
    userIntent: "place a wall",
    sessionLength: journal.records.length,
  });
  const demonstration = buildDemonstration({
    demonstrationId: "demo-1",
    title: "Wall placement",
    episodes: [episode],
    boundary: {
      covers: ["the recorded command sequence"],
      doesNotCover: ["anything outside the session"],
    },
  });
  const exportBundle = buildCandidateExport({
    exportId: "cand-1",
    demonstration,
    policies: [policy()],
    originProject: "proj-A",
    targetProject: "proj-A",
    preparedBy: "w029-tests",
  });
  return {
    journal: journalDigest(journal),
    episode: episodeDigest(episode),
    demonstration: demonstrationDigest(demonstration),
    candidate: candidateDigest(exportBundle),
  };
}

test("invariant 17: identical pipelines produce identical digests end-to-end", () => {
  const first = runPipeline();
  const second = runPipeline();
  assert.equal(first.journal, second.journal);
  assert.equal(first.episode, second.episode);
  assert.equal(first.demonstration, second.demonstration);
  assert.equal(first.candidate, second.candidate);
});

test("any change to event content or order changes the digest", () => {
  const a = makeEvent({
    session,
    sequence: 1,
    kind: "k",
    initiator: "human",
    payload: { n: 1 },
  });
  const b = makeEvent({
    session,
    sequence: 2,
    kind: "k",
    initiator: "human",
    payload: { n: 1 },
  });
  const changed = makeEvent({
    session,
    sequence: 1,
    kind: "k",
    initiator: "human",
    payload: { n: 2 },
  });
  assert.notEqual(computeEventDigest(a), computeEventDigest(changed));
  assert.notEqual(computeSequenceDigest([a, b]), computeSequenceDigest([b, a]));
});

test("payload key order never affects any digest", () => {
  const a = makeEvent({
    session,
    sequence: 1,
    kind: "k",
    initiator: "human",
    payload: { alpha: 1, beta: 2, gamma: { x: 1, y: 2 } },
  });
  const b = makeEvent({
    session,
    sequence: 1,
    kind: "k",
    initiator: "human",
    payload: { gamma: { y: 2, x: 1 }, beta: 2, alpha: 1 },
  });
  assert.equal(computeEventDigest(a), computeEventDigest(b));
  assert.equal(computeSequenceDigest([a]), computeSequenceDigest([b]));
});
