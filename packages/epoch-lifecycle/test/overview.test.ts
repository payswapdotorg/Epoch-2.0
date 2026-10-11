/**
 * W022 tests — the LifecycleOverview read-only projection: phases, current
 * phase, counts, evidence summary — sufficient for any host lifecycle view.
 *
 * Visits semantics (contract): a phase's `visits` counts ENTRIES. The
 * initial open at step 0 counts as the understand phase's first entry, and
 * every transition into a phase — forward or rework — counts as one more
 * entry. Exiting does not add a visit.
 */

import * as assert from "node:assert";
import { test } from "node:test";
import { canonicalizeLifecycleState, init, projectLifecycleOverview, recordLearningNote } from "../src/index.ts";
import { ANCHOR, walkTo } from "./helpers.ts";

test("overview: projects phases, current phase and counts for a fresh solution", () => {
  const machine = init();
  const state = machine.open(ANCHOR);
  const overview = projectLifecycleOverview(state);
  assert.strictEqual(overview.currentPhase, "understand");
  assert.strictEqual(overview.currentPhaseName, "Understand");
  assert.strictEqual(overview.step, 0);
  assert.strictEqual(overview.transitionCount, 0);
  assert.strictEqual(overview.eventCount, 0);
  assert.strictEqual(overview.reworkCount, 0);
  assert.strictEqual(overview.visitedPhaseCount, 1);
  assert.strictEqual(overview.phases.length, 10);
  assert.deepStrictEqual(
    overview.phases.map((phase) => phase.status),
    ["current", "pending", "pending", "pending", "pending", "pending", "pending", "pending", "pending", "pending"],
  );
  assert.strictEqual(overview.phases[0]?.enteredAtStep, 0);
  assert.ok(Object.isFrozen(overview));
});

test("overview: counts rework loops and revisited phases", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "observe");
  state = machine.advance(state, { to: "plan", reason: "observation invalidated the plan", evidence: ["e:rework-1"] });
  state = walkTo(machine, state, "verify");
  state = machine.advance(state, { to: "understand", reason: "verification failed", evidence: ["e:rework-2"] });
  state = machine.advance(state, { to: "decide", reason: "re-understood", evidence: ["e:resume"] });
  const overview = projectLifecycleOverview(state);
  assert.strictEqual(overview.currentPhase, "decide");
  assert.strictEqual(overview.step, 12);
  assert.strictEqual(overview.reworkCount, 2);
  assert.strictEqual(overview.visitedPhaseCount, 7);
  const byId = new Map(overview.phases.map((phase) => [phase.id, phase]));
  // visits = entries; the initial open counts as understand's first entry.
  assert.strictEqual(byId.get("understand")?.visits, 2); // open@0 + rework entry@11
  assert.strictEqual(byId.get("decide")?.visits, 2); // entry@1 + entry@12
  assert.strictEqual(byId.get("plan")?.visits, 2); // entry@2 + rework entry@6
  assert.strictEqual(byId.get("acquire")?.visits, 2); // entry@3 + entry@7
  assert.strictEqual(byId.get("realize")?.visits, 2); // entry@4 + entry@8
  assert.strictEqual(byId.get("observe")?.visits, 2); // entry@5 + entry@9
  assert.strictEqual(byId.get("verify")?.visits, 1); // entered exactly once@10, exited@11
  assert.strictEqual(byId.get("forecast")?.visits, 0);
  assert.strictEqual(byId.get("decide")?.enteredAtStep, 12);
  assert.strictEqual(byId.get("understand")?.enteredAtStep, 11);
  assert.strictEqual(byId.get("verify")?.exitedAtStep, 11);
  assert.strictEqual(byId.get("understand")?.status, "visited");
  assert.strictEqual(byId.get("decide")?.status, "current");
  assert.strictEqual(byId.get("forecast")?.status, "pending");
});

test("overview: summarizes unique sorted evidence digests and learning notes", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = machine.record(state, {
    kind: "observation",
    note: "obs",
    provenance: ["w022-test"],
    evidence: ["e:obs", "e:shared"],
  });
  state = machine.advance(state, { to: "decide", reason: "r", evidence: ["e:shared"] });
  state = walkTo(machine, state, "learn");
  state = recordLearningNote(state, {
    note: "n",
    plannedDigest: "sha256:planned",
    actualDigest: "sha256:actual",
    outcome: "deviation",
    provenance: ["w022-test"],
    evidence: ["e:learn"],
  });
  const overview = projectLifecycleOverview(state);
  assert.deepStrictEqual([...overview.evidenceDigests], [
    "e:learn",
    "e:obs",
    "e:shared",
    "sha256:actual",
    "sha256:planned",
    "walk:acquire",
    "walk:close",
    "walk:forecast",
    "walk:learn",
    "walk:observe",
    "walk:plan",
    "walk:realize",
    "walk:verify",
  ]);
  assert.strictEqual(overview.learningNoteCount, 1);
  assert.strictEqual(overview.learningDeviations, 1);
  assert.strictEqual(overview.learningAsPlanned, 0);
  assert.strictEqual(overview.eventCount, 2);
  assert.strictEqual(overview.transitionCount, 9);
  const understand = overview.phases[0];
  assert.ok(understand !== undefined);
  assert.strictEqual(understand.eventCount, 1);
  assert.strictEqual(understand.evidenceCount, 2);
  const learnPhase = overview.phases[9];
  assert.ok(learnPhase !== undefined);
  assert.strictEqual(learnPhase.eventCount, 1);
  assert.strictEqual(learnPhase.evidenceCount, 2);
});

test("overview: projecting never mutates the state", () => {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = walkTo(machine, state, "verify");
  const before = canonicalizeLifecycleState(state);
  const overview = projectLifecycleOverview(state);
  assert.strictEqual(canonicalizeLifecycleState(state), before);
  assert.strictEqual(overview.transitionCount, 6);
  assert.ok(Object.isFrozen(overview.phases));
});
