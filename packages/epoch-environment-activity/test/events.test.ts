import { test } from "node:test";
import assert from "node:assert/strict";

import {
  InvalidEventError,
  computeEventDigest,
  computeSequenceDigest,
  isEnvironmentEvent,
  makeCorrelation,
  makeEvent,
  makeEvidence,
} from "../src/index.js";

const session = { sessionId: "s-1", environmentId: "env-1" };

test("makeEvent assigns defaults, validates and deep-freezes events", () => {
  const event = makeEvent({
    session,
    sequence: 1,
    kind: "command.invoked",
    initiator: "human",
    payload: { command: "wall.create" },
  });
  assert.equal(event.captureQuality, "observed");
  assert.deepEqual(event.evidence, []);
  assert.deepEqual(event.correlations, []);
  assert.equal(Object.isFrozen(event), true);
  assert.ok(!Object.keys(event).includes("timestamp"));
  assert.ok(!Object.keys(event).some((key) => /time/i.test(key)));
});

test("makeEvent rejects invalid initiators, sequences, kinds and payloads", () => {
  assert.throws(
    () =>
      makeEvent({
        session,
        sequence: 1,
        kind: "command.invoked",
        initiator: "system" as never,
        payload: {},
      }),
    InvalidEventError,
  );
  assert.throws(
    () =>
      makeEvent({
        session,
        sequence: 0,
        kind: "command.invoked",
        initiator: "human",
        payload: {},
      }),
    InvalidEventError,
  );
  assert.throws(
    () =>
      makeEvent({
        session,
        sequence: 1,
        kind: "",
        initiator: "human",
        payload: {},
      }),
    InvalidEventError,
  );
  assert.throws(
    () =>
      makeEvent({
        session,
        sequence: 1,
        kind: "command.invoked",
        initiator: "human",
        payload: { bad: undefined } as never,
      }),
    InvalidEventError,
  );
});

test("isEnvironmentEvent accepts valid events and rejects malformed values", () => {
  const event = makeEvent({
    session,
    sequence: 2,
    kind: "view.changed",
    initiator: "application",
    payload: { camera: "top" },
  });
  assert.equal(isEnvironmentEvent(event), true);
  assert.equal(isEnvironmentEvent({ type: "environment-event" }), false);
  assert.equal(isEnvironmentEvent(null), false);
  assert.equal(isEnvironmentEvent("nope"), false);
});

test("event digests are byte-identical regardless of payload key order", () => {
  const a = makeEvent({
    session,
    sequence: 1,
    kind: "tool.applied",
    initiator: "agent",
    payload: { alpha: 1, beta: 2, gamma: { y: 1, x: 2 } },
  });
  const b = makeEvent({
    session,
    sequence: 1,
    kind: "tool.applied",
    initiator: "agent",
    payload: { gamma: { x: 2, y: 1 }, beta: 2, alpha: 1 },
  });
  assert.equal(computeEventDigest(a), computeEventDigest(b));
  assert.equal(computeEventDigest(a), computeEventDigest(a));
});

test("computeSequenceDigest is deterministic and order-sensitive", () => {
  const e1 = makeEvent({
    session,
    sequence: 1,
    kind: "a",
    initiator: "human",
    payload: {},
  });
  const e2 = makeEvent({
    session,
    sequence: 2,
    kind: "b",
    initiator: "human",
    payload: {},
  });
  const first = computeSequenceDigest([e1, e2]);
  assert.equal(first, computeSequenceDigest([e1, e2]));
  assert.notEqual(first, computeSequenceDigest([e2, e1]));
  assert.notEqual(first, computeSequenceDigest([e1]));
});

test("makeCorrelation and makeEvidence normalize optional fields and validate enums", () => {
  const correlation = makeCorrelation({
    role: "result",
    kind: "world-revision",
    digest: "sha256:opaque-foreign-digest",
  });
  assert.deepEqual(correlation, {
    role: "result",
    kind: "world-revision",
    digest: "sha256:opaque-foreign-digest",
    label: null,
  });
  assert.throws(
    () =>
      makeCorrelation({
        role: "outcome" as never,
        kind: "world-revision",
        digest: "d",
      }),
    InvalidEventError,
  );
  const evidence = makeEvidence({
    digest: "sha256:evidence-1",
    label: "screen",
  });
  assert.deepEqual(evidence, {
    digest: "sha256:evidence-1",
    label: "screen",
    role: null,
  });
  assert.throws(() => makeEvidence({ digest: "" }), InvalidEventError);
});
