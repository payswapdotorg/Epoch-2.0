import { test } from "node:test";
import assert from "node:assert/strict";

import * as candidatesModule from "../src/candidates.js";

import {
  CANDIDATE_STATUSES,
  type CandidateExport,
  PolicyViolationError,
  buildCandidateExport,
  buildDemonstration,
  candidateDigest,
  defineEpisode,
  makeCapturePolicy,
  makeEvent,
  policyDigest,
  verifyCandidateIntegrity,
} from "../src/index.js";

const session = { sessionId: "s-1", environmentId: "env-1" };

function policy(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  } as never);
}

function demonstration() {
  const episode = defineEpisode({
    episodeId: "ep-1",
    session,
    records: [
      makeEvent({
        session,
        sequence: 1,
        kind: "command.invoked",
        initiator: "human",
        payload: { n: 1 },
      }),
      makeEvent({
        session,
        sequence: 2,
        kind: "tool.applied",
        initiator: "agent",
        payload: { n: 2 },
      }),
    ],
    userIntent: "place a wall",
    sessionLength: 2,
  });
  return buildDemonstration({
    demonstrationId: "demo-1",
    title: "Wall placement",
    episodes: [episode],
    narrativeSteps: [
      {
        stepId: "s1",
        ordinal: 1,
        description: "invoke command",
        episodeId: "ep-1",
        sequence: 1,
      },
    ],
    resultCorrelations: [
      {
        role: "result",
        kind: "world-revision",
        digest: "sha256:simulated-revision",
      },
    ],
    boundary: {
      covers: ["the recorded command sequence"],
      doesNotCover: ["anything outside the session"],
    },
  });
}

test("candidate exports are always unverified and expose no promotion API", () => {
  const candidate = buildCandidateExport({
    exportId: "cand-1",
    demonstration: demonstration(),
    policies: [policy()],
    originProject: "proj-A",
    targetProject: "proj-A",
    preparedBy: "w029-tests",
  });
  assert.equal(candidate.status, "unverified-candidate");
  assert.deepEqual(CANDIDATE_STATUSES, ["unverified-candidate"]);
  for (const name of Object.keys(candidatesModule)) {
    assert.ok(
      !/promot|approv|install|grant|activat|certif/i.test(name),
      `unexpected promotion-shaped export: ${name}`,
    );
  }
  assert.equal(candidate.permissions.retentionAllowed, true);
  assert.ok(candidateDigest(candidate).startsWith("sha256:"));
});

test("retention must be permitted by every contributing policy", () => {
  assert.throws(
    () =>
      buildCandidateExport({
        exportId: "cand-2",
        demonstration: demonstration(),
        policies: [policy({ retention: { allowed: false } })],
        originProject: "proj-A",
        targetProject: "proj-A",
        preparedBy: "w029-tests",
      }),
    (error: unknown) =>
      error instanceof PolicyViolationError &&
      /retention-not-permitted/.test(error.message),
  );
});

test("cross-project reuse requires explicit permission; same-project export does not", () => {
  const reuseDenied = policy({ reuse: { allowed: false, projects: [] } });
  assert.throws(
    () =>
      buildCandidateExport({
        exportId: "cand-3",
        demonstration: demonstration(),
        policies: [reuseDenied],
        originProject: "proj-A",
        targetProject: "proj-B",
        preparedBy: "w029-tests",
      }),
    (error: unknown) =>
      error instanceof PolicyViolationError &&
      /cross-project-reuse-not-permitted/.test(error.message),
  );
  const sameProject = buildCandidateExport({
    exportId: "cand-4",
    demonstration: demonstration(),
    policies: [reuseDenied],
    originProject: "proj-A",
    targetProject: "proj-A",
    preparedBy: "w029-tests",
  });
  assert.equal(sameProject.status, "unverified-candidate");
  assert.equal(sameProject.permissions.crossProjectReuseAllowed, true);
});

test("reuse project lists constrain cross-project targets", () => {
  const listed = policy({ reuse: { allowed: true, projects: ["proj-B"] } });
  buildCandidateExport({
    exportId: "cand-5",
    demonstration: demonstration(),
    policies: [listed],
    originProject: "proj-A",
    targetProject: "proj-B",
    preparedBy: "w029-tests",
  });
  assert.throws(
    () =>
      buildCandidateExport({
        exportId: "cand-6",
        demonstration: demonstration(),
        policies: [listed],
        originProject: "proj-A",
        targetProject: "proj-C",
        preparedBy: "w029-tests",
      }),
    PolicyViolationError,
  );
});

test("provenance carries sessions, policy digests, consent subjects and coverage", () => {
  const demo = demonstration();
  const contributing = policy();
  const candidate = buildCandidateExport({
    exportId: "cand-7",
    demonstration: demo,
    policies: [contributing],
    originProject: "proj-A",
    targetProject: "proj-A",
    preparedBy: "w029-tests",
    notes: ["provenance note"],
  });
  assert.deepEqual(candidate.provenance.originatingSessions, [session]);
  assert.deepEqual(candidate.provenance.policyDigests, [
    policyDigest(contributing),
  ]);
  assert.deepEqual(candidate.provenance.consentSubjects, ["user-1"]);
  assert.equal(candidate.provenance.allConsentGranted, true);
  assert.equal(candidate.provenance.coverage.status, "complete");
  assert.deepEqual(candidate.provenance.notes, ["provenance note"]);
  assert.equal(
    candidate.demonstrationDigest,
    verifyCandidateIntegrity(candidate).actual,
  );
});

test("verifyCandidateIntegrity detects tampering", () => {
  const candidate = buildCandidateExport({
    exportId: "cand-8",
    demonstration: demonstration(),
    policies: [policy()],
    originProject: "proj-A",
    targetProject: "proj-A",
    preparedBy: "w029-tests",
  });
  assert.equal(verifyCandidateIntegrity(candidate).ok, true);
  // Tamper via a JSON clone viewed as a MUTABLE shape (the domain type is
  // readonly by design, so the mutation must not go through it).
  const tampered = JSON.parse(JSON.stringify(candidate)) as {
    demonstration: { title: string };
  };
  tampered.demonstration.title = "tampered";
  const result = verifyCandidateIntegrity(
    tampered as unknown as CandidateExport,
  );
  assert.equal(result.ok, false);
  assert.notEqual(result.actual, result.expected);
});
