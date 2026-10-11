/**
 * W022 tests — the LifecycleMachine: provider-neutral contracts, every
 * transition rule (changed behavior), and typed errors for every illegal
 * operation. Illegal transitions are NEVER silently corrected.
 */

import * as assert from "node:assert";
import { test } from "node:test";
import { DEFAULT_LIFECYCLE_POLICY, DEFAULT_LIFECYCLE_POLICY_ID, init } from "../src/index.ts";
import type { LifecycleAnchor, LifecycleEventRequest, LifecyclePhaseId } from "../src/index.ts";
import { ANCHOR, expectLifecycleError, walkTo } from "./helpers.ts";

const FORWARD_EDGES: readonly (readonly [LifecyclePhaseId, LifecyclePhaseId])[] = [
  ["understand", "decide"],
  ["decide", "plan"],
  ["plan", "acquire"],
  ["acquire", "realize"],
  ["realize", "observe"],
  ["observe", "verify"],
  ["verify", "forecast"],
  ["forecast", "close"],
  ["close", "learn"],
];

test("machine: init binds a validated policy and defaults to the standard policy", () => {
  const machine = init();
  assert.strictEqual(machine.policy.id, DEFAULT_LIFECYCLE_POLICY_ID);
  assert.deepStrictEqual(
    machine.policy.edges.map((edge) => `${edge.from}->${edge.to}`),
    DEFAULT_LIFECYCLE_POLICY.edges.map((edge) => `${edge.from}->${edge.to}`),
  );
  expectLifecycleError("invalid-policy", () => init({ id: "broken", edges: [] }));
  const custom = init({ id: "custom", edges: [{ from: "understand", to: "decide", kind: "forward" }] });
  assert.strictEqual(custom.policy.id, "custom");
});

test("machine: open anchors a fresh solution in understand at step 0", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  assert.strictEqual(state.phase, "understand");
  assert.strictEqual(state.step, 0);
  assert.strictEqual(state.enteredPhaseAtStep, 0);
  assert.strictEqual(state.policyId, DEFAULT_LIFECYCLE_POLICY_ID);
  assert.deepStrictEqual(state.anchor, { kind: "solution", digest: "sha256:solution-fixture-1" });
  assert.deepStrictEqual([...state.transitions], []);
  assert.deepStrictEqual([...state.events], []);
  assert.ok(Object.isFrozen(state));
});

test("machine: open rejects malformed anchors with a typed invalid-anchor error", () => {
  const machine = init();
  expectLifecycleError("invalid-anchor", () =>
    machine.open({ kind: "campaign", digest: "d" } as unknown as LifecycleAnchor),
  );
  expectLifecycleError("invalid-anchor", () => machine.open({ kind: "solution" } as unknown as LifecycleAnchor));
});

for (const [from, to] of FORWARD_EDGES) {
  test(`changed behavior: forward edge ${from} -> ${to}`, () => {
    const machine = init();
    let state = machine.open(ANCHOR);
    state = walkTo(machine, state, from);
    const stepBefore = state.step;
    const next = machine.advance(state, {
      to,
      reason: `moving from ${from} to ${to}`,
      evidence: [`e:${from}->${to}`],
    });
    assert.strictEqual(next.phase, to);
    assert.strictEqual(next.step, stepBefore + 1);
    assert.strictEqual(next.enteredPhaseAtStep, stepBefore + 1);
    assert.strictEqual(next.transitions.length, stepBefore + 1);
    const last = next.transitions[next.transitions.length - 1];
    assert.ok(last !== undefined);
    assert.strictEqual(last.from, from);
    assert.strictEqual(last.to, to);
    assert.deepStrictEqual([...last.evidence], [`e:${from}->${to}`]);
    assert.ok(Object.isFrozen(next));
  });
}

test("changed behavior: rework loop verify -> understand", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "verify");
  const reworked = machine.advance(state, {
    to: "understand",
    reason: "verification failed; revisit understanding",
    evidence: ["e:rework-1"],
  });
  assert.strictEqual(reworked.phase, "understand");
  assert.strictEqual(reworked.step, state.step + 1);
  assert.strictEqual(reworked.enteredPhaseAtStep, state.step + 1);
  const last = reworked.transitions[reworked.transitions.length - 1];
  assert.ok(last !== undefined);
  assert.strictEqual(last.from, "verify");
  assert.strictEqual(last.to, "understand");
  const resumed = walkTo(machine, reworked, "plan");
  assert.strictEqual(resumed.phase, "plan");
});

test("changed behavior: rework loop observe -> plan", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "observe");
  const reworked = machine.advance(state, {
    to: "plan",
    reason: "observation invalidated the plan",
    evidence: ["e:rework-2"],
  });
  assert.strictEqual(reworked.phase, "plan");
  const last = reworked.transitions[reworked.transitions.length - 1];
  assert.ok(last !== undefined);
  assert.strictEqual(last.from, "observe");
  assert.strictEqual(last.to, "plan");
  const resumed = walkTo(machine, reworked, "verify");
  assert.strictEqual(resumed.phase, "verify");
});

test("machine: advance stamps the from-phase and the next monotonic step", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  const next = machine.advance(state, { to: "decide", reason: "understanding recorded", evidence: ["e:1"] });
  const recorded = next.transitions[0];
  assert.ok(recorded !== undefined);
  assert.strictEqual(recorded.from, "understand");
  assert.strictEqual(recorded.step, 1);
  assert.strictEqual(next.step, 1);
});

test("machine: apply validates the raw transition object itself", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  const good = machine.advance(state, { to: "decide", reason: "r", evidence: ["e"] });
  expectLifecycleError("step-mismatch", () =>
    machine.apply(good, { from: "decide", to: "plan", step: 3, reason: "gap", evidence: ["e"] }),
  );
  const next = machine.apply(good, { from: "decide", to: "plan", step: 2, reason: "planning", evidence: ["e2"] });
  assert.strictEqual(next.phase, "plan");
  assert.strictEqual(next.step, 2);
});

test("machine: illegal transitions are typed illegal-edge errors, never silent corrections", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  expectLifecycleError("illegal-edge", () => machine.advance(state, { to: "plan", reason: "skipping", evidence: ["e"] }));
  expectLifecycleError("illegal-edge", () => machine.advance(state, { to: "understand", reason: "self", evidence: ["e"] }));
  assert.strictEqual(state.phase, "understand");
  assert.strictEqual(state.step, 0);
});

test("machine: illegal transitions are typed illegal-edge errors (learn -> understand)", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "learn");
  expectLifecycleError("illegal-edge", () => machine.advance(state, { to: "understand", reason: "restart", evidence: ["e"] }));
});

test("machine: illegal transitions are typed illegal-edge errors (verify -> plan is not an allowed rework loop)", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "verify");
  expectLifecycleError("illegal-edge", () =>
    machine.advance(state, { to: "plan", reason: "unauthorized rework", evidence: ["e"] }),
  );
});

test("machine: stale from-phase is a phase-mismatch error", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  expectLifecycleError("phase-mismatch", () =>
    machine.apply(state, { from: "decide", to: "plan", step: 1, reason: "stale", evidence: ["e"] }),
  );
});

test("machine: step gaps and replayed steps are step-mismatch errors", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  expectLifecycleError("step-mismatch", () =>
    machine.apply(state, { from: "understand", to: "decide", step: 2, reason: "gap", evidence: ["e"] }),
  );
  expectLifecycleError("step-mismatch", () =>
    machine.apply(state, { from: "understand", to: "decide", step: 0, reason: "replay", evidence: ["e"] }),
  );
});

test("machine: a missing reason or missing and malformed evidence are typed errors", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  expectLifecycleError("missing-reason", () => machine.advance(state, { to: "decide", reason: "", evidence: ["e"] }));
  expectLifecycleError("missing-evidence", () => machine.advance(state, { to: "decide", reason: "r", evidence: [] }));
  expectLifecycleError("invalid-evidence", () => machine.advance(state, { to: "decide", reason: "r", evidence: ["ok", ""] }));
  expectLifecycleError("invalid-evidence", () =>
    machine.advance(state, { to: "decide", reason: "r", evidence: "not-an-array" as unknown as string[] }),
  );
});

test("machine: a state governed by another policy is rejected", () => {
  const standard = init();
  const custom = init({ id: "custom", edges: [{ from: "understand", to: "decide", kind: "forward" }] });
  const state = custom.open(ANCHOR);
  expectLifecycleError("invalid-transition", () => standard.advance(state, { to: "decide", reason: "r", evidence: ["e"] }));
});

test("machine: phaseOf reports the active phase", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  assert.strictEqual(machine.phaseOf(state), "understand");
  state = walkTo(machine, state, "verify");
  assert.strictEqual(machine.phaseOf(state), "verify");
});

test("machine: historyOf returns the ordered transition list with evidence refs", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "plan");
  const history = machine.historyOf(state);
  assert.strictEqual(history.length, 2);
  assert.deepStrictEqual(
    history.map((transition) => [transition.from, transition.to, transition.step]),
    [
      ["understand", "decide", 1],
      ["decide", "plan", 2],
    ],
  );
  assert.ok(history.every((transition) => transition.evidence.length > 0));
});

test("machine: record appends an observable event without changing phase", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  const next = machine.record(state, {
    kind: "observation",
    note: "site conditions reviewed",
    provenance: ["w022-test"],
    evidence: ["e:obs-1"],
  });
  assert.strictEqual(next.phase, "understand");
  assert.strictEqual(next.enteredPhaseAtStep, 0);
  assert.strictEqual(next.events.length, 1);
  assert.strictEqual(next.events[0]?.note, "site conditions reviewed");
  assert.strictEqual(next.transitions.length, 0);
});

test("machine: events share the monotonic step counter with transitions (totally ordered log)", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = machine.record(state, { kind: "observation", note: "first", provenance: ["p"], evidence: ["e1"] });
  state = machine.advance(state, { to: "decide", reason: "r", evidence: ["e2"] });
  state = machine.record(state, { kind: "decision", note: "second", provenance: ["p"], evidence: ["e3"] });
  const steps = [...state.transitions.map((t) => t.step), ...state.events.map((e) => e.step)].sort((a, b) => a - b);
  assert.deepStrictEqual(steps, [1, 2, 3]);
  assert.strictEqual(state.step, 3);
});

test("machine: record rejects malformed events with typed errors", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  expectLifecycleError("invalid-event", () =>
    machine.record(state, { kind: "hunch", note: "n", provenance: ["p"], evidence: ["e"] } as unknown as LifecycleEventRequest),
  );
  expectLifecycleError("invalid-event", () =>
    machine.record(state, { kind: "observation", note: "", provenance: ["p"], evidence: ["e"] }),
  );
  expectLifecycleError("invalid-event", () =>
    machine.record(state, { kind: "observation", note: "n", provenance: [], evidence: ["e"] }),
  );
  expectLifecycleError("missing-evidence", () =>
    machine.record(state, { kind: "observation", note: "n", provenance: ["p"], evidence: [] }),
  );
  expectLifecycleError("invalid-event", () =>
    machine.record(state, {
      kind: "decision",
      note: "n",
      provenance: ["p"],
      evidence: ["e"],
      learning: { plannedDigest: "a", actualDigest: "b", outcome: "deviation" },
    }),
  );
});
