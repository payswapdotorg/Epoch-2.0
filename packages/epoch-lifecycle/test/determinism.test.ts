/**
 * W022 tests — the determinism law (invariant 17): identical operation
 * sequences produce byte-identical canonical serializations and identical
 * digests; state carries no timestamps, only monotonic step counters.
 */

import * as assert from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_LIFECYCLE_POLICY_ID,
  LifecycleError,
  canonicalizeLifecycleState,
  init,
  lifecycleStateDigest,
  parseLifecycleState,
  sha256Hex,
} from "../src/index.ts";
import type { LifecycleState } from "../src/index.ts";
import { ANCHOR } from "./helpers.ts";

function buildSequence(): LifecycleState {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = machine.record(state, {
    kind: "observation",
    note: "site conditions",
    provenance: ["w022-test"],
    evidence: ["e:obs-1"],
  });
  state = machine.advance(state, { to: "decide", reason: "understanding shared", evidence: ["e:dec-1"] });
  state = machine.record(state, {
    kind: "decision",
    note: "option B chosen",
    provenance: ["w022-test"],
    evidence: ["e:dec-2"],
  });
  state = machine.advance(state, { to: "plan", reason: "decision recorded", evidence: ["e:plan-1"] });
  return state;
}

test("sha256: pure implementation matches the published vectors", () => {
  assert.strictEqual(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.strictEqual(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.strictEqual(
    sha256Hex("The quick brown fox jumps over the lazy dog"),
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  );
  assert.strictEqual(sha256Hex("abc"), sha256Hex("abc"));
});

test("determinism: identical operation sequences produce byte-identical canonical serializations and identical digests", () => {
  const left = buildSequence();
  const right = buildSequence();
  assert.strictEqual(left.policyId, DEFAULT_LIFECYCLE_POLICY_ID);
  assert.strictEqual(canonicalizeLifecycleState(left), canonicalizeLifecycleState(right));
  assert.strictEqual(lifecycleStateDigest(left), lifecycleStateDigest(right));
  assert.strictEqual(lifecycleStateDigest(left).length, 64);
});

test("determinism: canonical serialization is key-order independent", () => {
  const state = buildSequence();
  const canonical = canonicalizeLifecycleState(state);
  const shuffled = JSON.stringify({
    events: state.events.map((event) => ({
      evidence: [...event.evidence],
      learning: event.learning,
      note: event.note,
      phase: event.phase,
      provenance: [...event.provenance],
      step: event.step,
      subject: event.subject,
      kind: event.kind,
    })),
    enteredPhaseAtStep: state.enteredPhaseAtStep,
    transitions: state.transitions.map((transition) => ({
      evidence: [...transition.evidence],
      from: transition.from,
      reason: transition.reason,
      step: transition.step,
      to: transition.to,
    })),
    policyId: state.policyId,
    anchor: { digest: state.anchor.digest, kind: state.anchor.kind },
    step: state.step,
    phase: state.phase,
  });
  const parsed = parseLifecycleState(shuffled);
  assert.strictEqual(canonicalizeLifecycleState(parsed), canonical);
});

test("determinism: state carries monotonic step counters, never timestamps", () => {
  const state = buildSequence();
  assert.deepStrictEqual(Object.keys(state).sort(), [
    "anchor",
    "enteredPhaseAtStep",
    "events",
    "phase",
    "policyId",
    "step",
    "transitions",
  ]);
  const steps = [...state.transitions.map((t) => t.step), ...state.events.map((e) => e.step)].sort((a, b) => a - b);
  assert.deepStrictEqual(steps, Array.from({ length: state.step }, (_, index) => index + 1));
  const canonical = canonicalizeLifecycleState(state);
  assert.ok(!/"(date|time|timestamp|createdAt|updatedAt|clock)"/i.test(canonical));
});

test("determinism: serialization is stable across wall-clock progression", () => {
  const first = buildSequence();
  const before = Date.now();
  let spins = 0;
  while (Date.now() === before && spins < 1000000) {
    spins += 1;
  }
  const second = buildSequence();
  assert.strictEqual(canonicalizeLifecycleState(second), canonicalizeLifecycleState(first));
  assert.strictEqual(lifecycleStateDigest(second), lifecycleStateDigest(first));
});

test("serialization: canonicalize rejects non-safe integers with a typed error", () => {
  const state = buildSequence();
  const unsafe = { ...state, step: 1.5 };
  assert.throws(
    () => canonicalizeLifecycleState(unsafe),
    (error: unknown) => error instanceof LifecycleError && error.code === "serialization",
  );
});

test("serialization: canonical bytes round-trip through parseLifecycleState", () => {
  const state = buildSequence();
  const canonical = canonicalizeLifecycleState(state);
  const parsed = parseLifecycleState(canonical);
  assert.strictEqual(canonicalizeLifecycleState(parsed), canonical);
  assert.deepStrictEqual(parsed, state);
  assert.strictEqual(lifecycleStateDigest(parsed), lifecycleStateDigest(state));
});

test("serialization: parse rejects tampered or inconsistent logs", () => {
  const state = buildSequence();
  const canonical = canonicalizeLifecycleState(state);
  assert.throws(
    () => parseLifecycleState("not-json"),
    (error: unknown) => error instanceof LifecycleError && error.code === "serialization",
  );
  const withBadPhase = JSON.parse(canonical);
  withBadPhase.phase = "imagine";
  assert.throws(
    () => parseLifecycleState(JSON.stringify(withBadPhase)),
    (error: unknown) => error instanceof LifecycleError && error.code === "serialization",
  );
  const withGap = JSON.parse(canonical);
  withGap.events = [];
  assert.throws(
    () => parseLifecycleState(JSON.stringify(withGap)),
    (error: unknown) => error instanceof LifecycleError && error.code === "step-mismatch",
  );
  const withStaleFrom = JSON.parse(canonical);
  withStaleFrom.transitions[1].from = "understand";
  assert.throws(
    () => parseLifecycleState(JSON.stringify(withStaleFrom)),
    (error: unknown) => error instanceof LifecycleError && error.code === "phase-mismatch",
  );
  const withEarlyLearning = JSON.parse(canonical);
  withEarlyLearning.events[1].kind = "learning-note";
  withEarlyLearning.events[1].learning = { plannedDigest: "p", actualDigest: "a", outcome: "deviation" };
  assert.throws(
    () => parseLifecycleState(JSON.stringify(withEarlyLearning)),
    (error: unknown) => error instanceof LifecycleError && error.code === "event-phase-mismatch",
  );
  const withEnteredWrong = JSON.parse(canonical);
  withEnteredWrong.enteredPhaseAtStep = 2;
  assert.throws(
    () => parseLifecycleState(JSON.stringify(withEnteredWrong)),
    (error: unknown) => error instanceof LifecycleError && error.code === "step-mismatch",
  );
});
