import { test } from "node:test";
import assert from "node:assert/strict";

import {
  InvalidPolicyError,
  createSessionRecorder,
  journalDigest,
  makeCapturePolicy,
  policyDigest,
} from "../src/index.js";

const session = { sessionId: "s-1", environmentId: "env-1" };

function fullPolicy(overrides: Record<string, unknown> = {}) {
  return makeCapturePolicy({
    policyId: "pol-1",
    subject: "user-1",
    environmentId: "env-1",
    scope: {
      includedEventKinds: ["*"],
      excludedEventKinds: ["input.key"],
      includedInitiators: ["human", "agent", "application"],
    },
    consent: { consentId: "c-1", subject: "user-1", state: "granted" },
    retention: { allowed: true },
    reuse: { allowed: true, projects: ["*"] },
    ...overrides,
  } as never);
}

test("recorder assigns dense monotonic sequence numbers per session (never timestamps)", () => {
  const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
  recorder.record({ kind: "session.opened", initiator: "human", payload: {} });
  recorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: { command: "wall.create" },
  });
  recorder.record({ kind: "tool.applied", initiator: "agent", payload: {}, sensitive: true });
  recorder.noteGap("missed-events", 2, "renderer dropped frames");
  recorder.record({ kind: "view.changed", initiator: "application", payload: {} });
  const journal = recorder.snapshot();
  assert.equal(journal.records.length, 5);
  for (let index = 0; index < journal.records.length; index += 1) {
    assert.equal(journal.records[index].sequence, index + 1);
  }
  const json = JSON.stringify(journal);
  assert.ok(!json.includes("timestamp"));
  assert.ok(!/"(at|time|date|createdAt)"/.test(json));
});

test("out-of-scope events are never recorded — not even as markers", () => {
  const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
  recorder.record({ kind: "command.invoked", initiator: "human", payload: { a: 1 } });
  const before = recorder.snapshot();
  const outcome = recorder.record({
    kind: "input.key",
    initiator: "human",
    payload: { key: "ArrowLeft", secret: "hunter2" },
  });
  assert.equal(outcome.status, "rejected");
  assert.equal((outcome as { reason: string }).reason, "out-of-scope");
  const after = recorder.snapshot();
  assert.equal(after.records.length, before.records.length);
  const json = JSON.stringify(after);
  assert.ok(!json.includes("input.key"));
  assert.ok(!json.includes("ArrowLeft"));
  assert.ok(!json.includes("hunter2"));
});

test("events are rejected while capture is paused or consent is withdrawn", () => {
  const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
  recorder.record({ kind: "command.invoked", initiator: "human", payload: { n: 1 } });
  recorder.pause();
  const paused = recorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: { n: 2 },
  });
  assert.deepEqual(paused, {
    status: "rejected",
    reason: "capture-paused",
    detail: "capture is paused; call resume() to continue",
  });
  recorder.resume();
  const resumed = recorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: { n: 3 },
  });
  assert.equal(resumed.status, "recorded");

  const withdrawnRecorder = createSessionRecorder({
    session,
    policies: [
      fullPolicy({
        consent: { consentId: "c-1", subject: "user-1", state: "withdrawn" },
      }),
    ],
  });
  const refused = withdrawnRecorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: {},
  });
  assert.equal(refused.status, "rejected");
  assert.equal((refused as { reason: string }).reason, "consent-not-granted");
  withdrawnRecorder.setPolicies([fullPolicy()]);
  const allowed = withdrawnRecorder.record({
    kind: "command.invoked",
    initiator: "human",
    payload: {},
  });
  assert.equal(allowed.status, "recorded");
});

test("sensitive inputs and sensitive windows produce redaction markers, never content", () => {
  const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
  const sensitive = recorder.record({
    kind: "note.composed",
    initiator: "human",
    payload: { text: "PERSONAL-SECRET-CONTENT" },
    sensitive: true,
  });
  assert.equal(sensitive.status, "redacted");
  recorder.beginSensitiveWindow("screen share with personal content");
  const duringWindow = recorder.record({
    kind: "view.changed",
    initiator: "human",
    payload: { camera: "PERSONAL-CAMERA" },
  });
  assert.equal(duringWindow.status, "redacted");
  recorder.endSensitiveWindow();
  const journal = recorder.snapshot();
  assert.equal(journal.records.length, 4);
  const json = JSON.stringify(journal);
  assert.ok(json.includes("redaction-marker"));
  assert.ok(!json.includes("PERSONAL-SECRET-CONTENT"));
  assert.ok(!json.includes("PERSONAL-CAMERA"));
  assert.equal(journal.coverage.counts.redactionMarkers, 4);
  assert.equal(journal.coverage.counts.events, 0);
  assert.equal(journal.coverage.complete, false);
  assert.ok(journal.coverage.windows.some((window) => window.kind === "partial"));
});

test("pause and resume insert gap markers and unobserved coverage windows", () => {
  const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
  recorder.record({ kind: "session.opened", initiator: "human", payload: {} });
  recorder.pause();
  recorder.record({ kind: "command.invoked", initiator: "human", payload: {} });
  recorder.resume();
  recorder.record({ kind: "view.changed", initiator: "human", payload: {} });
  const journal = recorder.snapshot();
  assert.equal(journal.coverage.counts.events, 2);
  assert.equal(journal.coverage.counts.gapMarkers, 2);
  assert.deepEqual(
    journal.coverage.windows.map((window) => window.kind),
    ["observed", "unobserved", "observed"],
  );
  assert.equal(journal.coverage.complete, false);
  assert.equal(journal.records[1].type, "gap-marker");
  assert.equal(
    (journal.records[1] as { reason: string }).reason,
    "capture-paused",
  );
});

test("inspect exposes mode, policies, counts and coverage at any time", () => {
  const policy = fullPolicy();
  const recorder = createSessionRecorder({ session, policies: [policy] });
  const empty = recorder.inspect();
  assert.equal(empty.mode, "active");
  assert.equal(empty.lastSequence, null);
  assert.equal(empty.counts.events, 0);
  assert.equal(empty.coverage.complete, false);
  assert.deepEqual(empty.loadedPolicyDigests, [policyDigest(policy)]);
  recorder.record({ kind: "command.invoked", initiator: "human", payload: {} });
  recorder.record({ kind: "view.changed", initiator: "human", payload: {}, sensitive: true });
  recorder.pause();
  const inspected = recorder.inspect();
  assert.equal(inspected.mode, "paused");
  assert.equal(inspected.counts.events, 1);
  assert.equal(inspected.counts.redactionMarkers, 1);
  assert.equal(inspected.counts.rejectedAttempts, 0);
  assert.equal(inspected.lastSequence, 3);
  assert.equal(inspected.coverage.complete, false);
  assert.deepEqual(inspected.contributingPolicyDigests, [policyDigest(policy)]);
});

test("noteGap records missed-event gaps with estimates and unobserved coverage", () => {
  const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
  recorder.record({ kind: "session.opened", initiator: "human", payload: {} });
  const marker = recorder.noteGap("missed-events", 3, "source briefly unavailable");
  assert.equal(marker.estimatedMissed, 3);
  recorder.record({ kind: "session.closed", initiator: "human", payload: {} });
  const journal = recorder.snapshot();
  assert.equal(journal.records[1].type, "gap-marker");
  assert.ok(journal.coverage.windows.some((window) => window.kind === "unobserved"));
  assert.equal(journal.coverage.complete, false);
});

test("identical sessions produce identical journal digests (determinism)", () => {
  const runSession = (): string => {
    const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
    recorder.record({ kind: "session.opened", initiator: "human", payload: { who: "u1" } });
    recorder.record({
      kind: "command.invoked",
      initiator: "human",
      payload: { command: "wall.create", args: { height: 3.2 } },
    });
    recorder.pause();
    recorder.resume();
    recorder.record({ kind: "tool.applied", initiator: "agent", payload: { tool: "t" } });
    return journalDigest(recorder.snapshot());
  };
  assert.equal(runSession(), runSession());
});

test("setPolicies rejects empty and environment-mismatched policy sets", () => {
  const recorder = createSessionRecorder({ session, policies: [fullPolicy()] });
  assert.throws(() => recorder.setPolicies([]), InvalidPolicyError);
  assert.throws(
    () => recorder.setPolicies([fullPolicy({ environmentId: "other-env" })]),
    InvalidPolicyError,
  );
  assert.throws(
    () =>
      createSessionRecorder({
        session,
        policies: [fullPolicy({ environmentId: "other-env" })],
      }),
    InvalidPolicyError,
  );
});
