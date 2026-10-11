/**
 * W022 tests — Learn-phase honesty: structured planned-vs-actual notes keyed
 * by digests; no training, no model calls, no mutation of prior evidence.
 */

import * as assert from "node:assert";
import { test } from "node:test";
import { canonicalizeLifecycleState, deriveLearnings, init, recordLearningNote } from "../src/index.ts";
import { ANCHOR, expectLifecycleError, walkTo } from "./helpers.ts";

test("learn: structured notes may only be recorded in the learn phase", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "verify");
  expectLifecycleError("event-phase-mismatch", () =>
    recordLearningNote(state, {
      note: "too early",
      plannedDigest: "p",
      actualDigest: "a",
      outcome: "as-planned",
      provenance: ["w022-test"],
      evidence: ["e"],
    }),
  );
  state = walkTo(machine, state, "learn");
  const noted = recordLearningNote(state, {
    note: "planned vs actual",
    plannedDigest: "sha256:plan-1",
    actualDigest: "sha256:actual-1",
    outcome: "deviation",
    provenance: ["w022-test"],
    evidence: ["e:learn-1"],
  });
  assert.strictEqual(noted.phase, "learn");
  assert.strictEqual(noted.events.length, 1);
});

test("learn: the learn phase accepts only structured learning notes", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "learn");
  expectLifecycleError("event-phase-mismatch", () =>
    machine.record(state, { kind: "observation", note: "no observations here", provenance: ["w022-test"], evidence: ["e"] }),
  );
  const noted = recordLearningNote(state, {
    note: "n",
    plannedDigest: "p",
    actualDigest: "a",
    outcome: "as-planned",
    provenance: ["w022-test"],
    evidence: ["e"],
  });
  expectLifecycleError("invalid-event", () =>
    recordLearningNote(noted, {
      note: "missing outcome",
      plannedDigest: "p",
      actualDigest: "a",
      outcome: "sideways" as unknown as "deviation",
      provenance: ["w022-test"],
      evidence: ["e"],
    }),
  );
});

test("learn: notes record planned-vs-actual digests with an honest outcome", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "learn");
  state = recordLearningNote(state, {
    note: "wall thickness",
    plannedDigest: "sha256:planned-wall",
    actualDigest: "sha256:actual-wall",
    outcome: "deviation",
    provenance: ["w022-test"],
    evidence: ["e:learn-1"],
  });
  state = recordLearningNote(state, {
    note: "schedule",
    plannedDigest: "sha256:planned-schedule",
    actualDigest: "sha256:actual-schedule",
    outcome: "as-planned",
    provenance: ["w022-test"],
    evidence: ["e:learn-2"],
  });
  const notes = state.events.filter((event) => event.kind === "learning-note");
  assert.strictEqual(notes.length, 2);
  assert.deepStrictEqual(
    notes.map((event) => event.learning?.outcome),
    ["deviation", "as-planned"],
  );
  assert.deepStrictEqual(
    notes.map((event) => [event.learning?.plannedDigest, event.learning?.actualDigest]),
    [
      ["sha256:planned-wall", "sha256:actual-wall"],
      ["sha256:planned-schedule", "sha256:actual-schedule"],
    ],
  );
});

test("learn: deriveLearnings is a pure derived projection - no training, no model calls", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "learn");
  state = recordLearningNote(state, {
    note: "n1",
    plannedDigest: "p1",
    actualDigest: "a1",
    outcome: "deviation",
    provenance: ["w022-test"],
    evidence: ["e1"],
  });
  state = recordLearningNote(state, {
    note: "n2",
    plannedDigest: "p2",
    actualDigest: "a2",
    outcome: "as-planned",
    provenance: ["w022-test"],
    evidence: ["e2"],
  });
  const before = canonicalizeLifecycleState(state);
  const first = deriveLearnings(state);
  const second = deriveLearnings(state);
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.length, 2);
  assert.deepStrictEqual(
    first.map((note) => note.outcome),
    ["deviation", "as-planned"],
  );
  assert.strictEqual(canonicalizeLifecycleState(state), before);
});

test("learn: prior evidence cannot be mutated after recording", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "learn");
  state = recordLearningNote(state, {
    note: "immutable",
    plannedDigest: "p",
    actualDigest: "a",
    outcome: "deviation",
    provenance: ["w022-test"],
    evidence: ["e"],
  });
  const event = state.events[0];
  assert.ok(event !== undefined);
  assert.ok(Object.isFrozen(event));
  assert.ok(Object.isFrozen(state));
  assert.throws(() => {
    (event as unknown as { note: string }).note = "tampered";
  });
  assert.throws(() => {
    (state as unknown as { step: number }).step = 99;
  });
});
