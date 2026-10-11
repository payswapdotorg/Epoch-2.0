import { test } from "node:test";
import assert from "node:assert/strict";

import {
  InvalidEpisodeError,
  defineEpisode,
  episodeDigest,
  intentLabel,
  isActivityEpisode,
  isDeepFrozen,
  makeEvent,
  makeGapMarker,
  makeRedactionMarker,
} from "../src/index.js";

const session = { sessionId: "s-1", environmentId: "env-1" };

function event(sequence: number, kind = "command.invoked") {
  return makeEvent({ session, sequence, kind, initiator: "human", payload: { n: sequence } });
}

test("user-stated and inferred intent are kept as distinct fields", () => {
  const episode = defineEpisode({
    episodeId: "ep-1",
    session,
    records: [event(1), event(2)],
    userIntent: "Place two walls",
    inferredIntent: "The user is modeling a room",
    inferredIntentBasis: "repeated wall.create commands",
    sessionLength: 2,
  });
  assert.equal(episode.userIntent, "Place two walls");
  assert.equal(episode.inferredIntent, "The user is modeling a room");
  assert.notEqual(episode.userIntent, episode.inferredIntent);
  assert.equal(intentLabel(episode), "user-stated+inferred");
  const inferredOnly = defineEpisode({
    episodeId: "ep-2",
    session,
    records: [event(1)],
    inferredIntent: "exploration",
    sessionLength: 1,
  });
  assert.equal(intentLabel(inferredOnly), "inferred");
  assert.equal(inferredOnly.userIntent, null);
  const userOnly = defineEpisode({
    episodeId: "ep-3",
    session,
    records: [event(1)],
    userIntent: "stated",
    sessionLength: 1,
  });
  assert.equal(intentLabel(userOnly), "user-stated");
  assert.equal(userOnly.inferredIntent, null);
  assert.equal(
    intentLabel(
      defineEpisode({ episodeId: "ep-4", session, records: [event(1)], sessionLength: 1 }),
    ),
    "none",
  );
});

test("inferredIntentBasis requires inferredIntent; intent is always labeled", () => {
  assert.throws(
    () =>
      defineEpisode({
        episodeId: "ep-x",
        session,
        records: [event(1)],
        inferredIntentBasis: "basis without intent",
        sessionLength: 1,
      }),
    InvalidEpisodeError,
  );
});

test("contiguous event-only subsequences are complete-subsequence", () => {
  const episode = defineEpisode({
    episodeId: "ep-contig",
    session,
    records: [event(2), event(3), event(4)],
    sessionLength: 10,
  });
  assert.equal(episode.coverage.status, "complete-subsequence");
  assert.deepEqual(episode.coverage.missingSequenceRanges, []);
  assert.equal(episode.coverage.fromSequence, 2);
  assert.equal(episode.coverage.toSequence, 4);
  assert.equal(episode.coverage.sessionLength, 10);
  assert.equal(isActivityEpisode(episode), true);
});

test("sequence holes are typed as missing ranges and mark the episode partial", () => {
  const episode = defineEpisode({
    episodeId: "ep-holes",
    session,
    records: [event(2), event(3), event(7)],
    sessionLength: 10,
  });
  assert.equal(episode.coverage.status, "partial");
  assert.deepEqual(episode.coverage.missingSequenceRanges, [
    { fromSequence: 4, toSequence: 6 },
  ]);
});

test("gap and redaction markers make an episode partial and are labeled", () => {
  const gap = makeGapMarker({
    session,
    sequence: 2,
    reason: "missed-events",
    estimatedMissed: 1,
  });
  const redaction = makeRedactionMarker({
    session,
    sequence: 3,
    reason: "sensitive-window",
  });
  const episode = defineEpisode({
    episodeId: "ep-markers",
    session,
    records: [event(1), gap, redaction, event(4)],
    sessionLength: 4,
  });
  assert.equal(episode.coverage.status, "partial");
  assert.equal(episode.coverage.containsGapMarkers, true);
  assert.equal(episode.coverage.containsRedactionMarkers, true);
  assert.deepEqual(episode.coverage.missingSequenceRanges, []);
});

test("record lists must be non-empty, single-session, increasing and within sessionLength", () => {
  assert.throws(
    () => defineEpisode({ episodeId: "e", session, records: [], sessionLength: 0 }),
    InvalidEpisodeError,
  );
  const otherSession = { sessionId: "s-2", environmentId: "env-1" };
  assert.throws(
    () =>
      defineEpisode({
        episodeId: "e",
        session,
        records: [event(1), makeEvent({ session: otherSession, sequence: 2, kind: "k", initiator: "human", payload: {} })],
        sessionLength: 2,
      }),
    InvalidEpisodeError,
  );
  assert.throws(
    () =>
      defineEpisode({ episodeId: "e", session, records: [event(2), event(1)], sessionLength: 2 }),
    InvalidEpisodeError,
  );
  assert.throws(
    () =>
      defineEpisode({ episodeId: "e", session, records: [event(5)], sessionLength: 3 }),
    InvalidEpisodeError,
  );
});

test("episodes are deep-frozen and episode digests are deterministic", () => {
  const build = (): ReturnType<typeof defineEpisode> =>
    defineEpisode({
      episodeId: "ep-d",
      session,
      records: [event(1), event(2)],
      userIntent: "u",
      inferredIntent: "i",
      inferredIntentBasis: "b",
      sessionLength: 2,
    });
  const a = build();
  const b = build();
  assert.equal(Object.isFrozen(a), true);
  assert.equal(isDeepFrozen(a), true);
  assert.equal(episodeDigest(a), episodeDigest(b));
  const changed = defineEpisode({
    episodeId: "ep-d2",
    session,
    records: [event(1), event(2)],
    userIntent: "u",
    inferredIntent: "different inference",
    inferredIntentBasis: "b",
    sessionLength: 2,
  });
  assert.notEqual(episodeDigest(a), episodeDigest(changed));
  assert.equal(isActivityEpisode({ type: "activity-episode" }), false);
});
