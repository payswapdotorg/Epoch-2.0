import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IncompleteSequenceError,
  InvalidDemonstrationError,
  assertDemonstrationCoverageComplete,
  buildDemonstration,
  demonstrationDigest,
  isDeepFrozen,
  makeEvent,
  defineEpisode,
} from "../src/index.js";

const session = { sessionId: "s-1", environmentId: "env-1" };

function completeEpisode(id: string) {
  return defineEpisode({
    episodeId: id,
    session,
    records: [
      makeEvent({ session, sequence: 2, kind: "command.invoked", initiator: "human", payload: { n: 1 } }),
      makeEvent({ session, sequence: 3, kind: "tool.applied", initiator: "agent", payload: { n: 2 } }),
    ],
    userIntent: "place a wall",
    sessionLength: 5,
  });
}

function partialEpisode(id: string) {
  return defineEpisode({
    episodeId: id,
    session,
    records: [
      makeEvent({ session, sequence: 2, kind: "command.invoked", initiator: "human", payload: { n: 1 } }),
      makeEvent({ session, sequence: 5, kind: "view.changed", initiator: "human", payload: { n: 2 } }),
    ],
    sessionLength: 6,
  });
}

const boundary = {
  covers: ["the command sequence that produced the wall"],
  doesNotCover: ["events outside the recorded session", "semantic correctness"],
  openQuestions: ["was the view change intentional?"],
};

test("boundaries must state what the demonstration covers and does not cover", () => {
  assert.throws(
    () =>
      buildDemonstration({
        demonstrationId: "d-1",
        title: "t",
        episodes: [completeEpisode("ep-1")],
        boundary: { covers: [], doesNotCover: ["x"] },
      }),
    InvalidDemonstrationError,
  );
  assert.throws(
    () =>
      buildDemonstration({
        demonstrationId: "d-1",
        title: "t",
        episodes: [completeEpisode("ep-1")],
        boundary: { covers: ["a"], doesNotCover: [] },
      }),
    InvalidDemonstrationError,
  );
  const demo = buildDemonstration({
    demonstrationId: "d-1",
    title: "Wall placement",
    episodes: [completeEpisode("ep-1")],
    boundary,
  });
  assert.deepEqual(demo.boundary.doesNotCover, boundary.doesNotCover);
  assert.deepEqual(demo.boundary.covers, boundary.covers);
});

test("narrative steps must be ordinally complete and reference real episodes", () => {
  const base = {
    demonstrationId: "d-2",
    title: "t",
    episodes: [completeEpisode("ep-1")],
    boundary,
  };
  assert.throws(
    () =>
      buildDemonstration({
        ...base,
        narrativeSteps: [
          { stepId: "s1", ordinal: 1, description: "a" },
          { stepId: "s2", ordinal: 3, description: "b" },
        ],
      }),
    InvalidDemonstrationError,
  );
  assert.throws(
    () =>
      buildDemonstration({
        ...base,
        narrativeSteps: [
          { stepId: "s1", ordinal: 1, description: "a", episodeId: "nope" },
        ],
      }),
    InvalidDemonstrationError,
  );
  assert.throws(
    () =>
      buildDemonstration({
        ...base,
        narrativeSteps: [
          { stepId: "s1", ordinal: 1, description: "a", sequence: 99, episodeId: "ep-1" },
        ],
      }),
    InvalidDemonstrationError,
  );
  assert.throws(
    () =>
      buildDemonstration({
        ...base,
        narrativeSteps: [
          { stepId: "s1", ordinal: 1, description: "a", sequence: 2 },
        ],
      }),
    InvalidDemonstrationError,
  );
  const demo = buildDemonstration({
    ...base,
    narrativeSteps: [
      { stepId: "s1", ordinal: 2, description: "second" },
      { stepId: "s2", ordinal: 1, description: "first", episodeId: "ep-1", sequence: 2 },
    ],
  });
  assert.equal(demo.narrativeSteps.length, 2);
  assert.equal(demo.narrativeSteps[0].ordinal, 2);
});

test("demonstration coverage never claims completeness over partial episodes", () => {
  const incomplete = buildDemonstration({
    demonstrationId: "d-3",
    title: "t",
    episodes: [completeEpisode("ep-c"), partialEpisode("ep-p")],
    boundary,
  });
  assert.equal(incomplete.coverage.status, "incomplete");
  assert.deepEqual(incomplete.coverage.partialEpisodeIds, ["ep-p"]);
  assert.ok(incomplete.coverage.reasons.length > 0);
  assert.ok(incomplete.coverage.reasons[0].includes("ep-p"));
  assert.throws(
    () => assertDemonstrationCoverageComplete(incomplete),
    IncompleteSequenceError,
  );
  const complete = buildDemonstration({
    demonstrationId: "d-4",
    title: "t",
    episodes: [completeEpisode("ep-c")],
    boundary,
  });
  assert.equal(complete.coverage.status, "complete");
  assert.deepEqual(complete.coverage.partialEpisodeIds, []);
  assert.doesNotThrow(() => assertDemonstrationCoverageComplete(complete));
});

test("result correlations are digest references only and no mutation surface exists", () => {
  const demo = buildDemonstration({
    demonstrationId: "d-5",
    title: "t",
    episodes: [completeEpisode("ep-c")],
    resultCorrelations: [
      {
        role: "result",
        kind: "world-revision",
        digest: "sha256:opaque-world-revision-digest",
        label: "resulting revision",
      },
    ],
    boundary,
  });
  assert.equal(demo.resultCorrelations.length, 1);
  assert.equal(typeof demo.resultCorrelations[0].digest, "string");
  assert.equal(demo.resultCorrelations[0].kind, "world-revision");
  assert.equal(demo.resultCorrelations[0].role, "result");
  // No-authority law: no function-valued property anywhere on the demonstration.
  const walk = (value: unknown): void => {
    assert.notEqual(
      typeof value,
      "function",
      "demonstrations must carry data only",
    );
  };
  Object.values(demo).forEach(walk);
  assert.equal(isDeepFrozen(demo), true);
  assert.equal(Object.isFrozen(demo.resultCorrelations[0]), true);
});

test("demonstrations are deep-frozen and digests are deterministic", () => {
  const build = (): ReturnType<typeof buildDemonstration> =>
    buildDemonstration({
      demonstrationId: "d-6",
      title: "t",
      episodes: [completeEpisode("ep-c")],
      boundary,
    });
  const a = build();
  const b = build();
  assert.equal(demonstrationDigest(a), demonstrationDigest(b));
  assert.equal(Object.isFrozen(a), true);
  const other = buildDemonstration({
    demonstrationId: "d-7",
    title: "different",
    episodes: [completeEpisode("ep-c")],
    boundary,
  });
  assert.notEqual(demonstrationDigest(a), demonstrationDigest(other));
});
