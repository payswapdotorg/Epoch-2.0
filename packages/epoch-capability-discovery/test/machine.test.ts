import { describe, expect, it } from "vitest";
import {
  canonicalJSON,
  defaultDiscoveryPolicy,
  definePolicy,
  init,
  overviewOf,
} from "../src/index.ts";
import type { CapabilityEvidence } from "../src/index.ts";

function evidence(kind: string, payloadDigest: string): CapabilityEvidence {
  return { kind, payloadDigest, sourceRefs: [] };
}

describe("DiscoveryMachine core behavior", () => {
  it("init builds a machine bound to the policy digest with a fresh deterministic state", () => {
    const policy = defaultDiscoveryPolicy();
    const machine = init(policy);
    const state = machine.initialState();
    expect(machine.policyDigest).toHaveLength(64);
    expect(state.step).toBe(0);
    expect(state.policyDigest).toBe(machine.policyDigest);
    expect(machine.initialState().sessionId).toBe(state.sessionId);
    expect(canonicalJSON(machine.initialState())).toBe(canonicalJSON(state));
  });

  it("evaluate advances a monotonic step counter and never mutates the input state", () => {
    const machine = init(defaultDiscoveryPolicy());
    let state = machine.initialState();
    for (let i = 0; i < 4; i++) {
      const before = canonicalJSON(state);
      const evaluation = machine.evaluate(
        state,
        evidence("task.completed", `d${i}`.padEnd(64, "0")),
      );
      expect(evaluation.state.step).toBe(i + 1);
      expect(evaluation.previousStateDigest).toBe(machine.stateDigestOf(state));
      expect(canonicalJSON(state)).toBe(before);
      state = evaluation.state;
    }
    expect(state.step).toBe(4);
  });

  it("evaluate rejects states bound to a different policy", () => {
    const machineA = init(defaultDiscoveryPolicy());
    const machineB = init(
      definePolicy({
        rules: [
          {
            id: "rule/other",
            description: "other",
            match: { evidenceKind: "task.completed" },
            candidate: {
              roleId: "capability.role/other",
              scope: { appliesTo: ["task"] },
            },
            weight: 1,
          },
        ],
      }),
    );
    const stateB = machineB.initialState();
    expect(() =>
      machineA.evaluate(stateB, evidence("task.completed", "x".repeat(64))),
    ).toThrow(/policy digest/);
  });

  it("historyOf records one provenance entry per evaluated evidence", () => {
    const machine = init(defaultDiscoveryPolicy());
    let state = machine.initialState();
    state = machine.evaluate(
      state,
      evidence("task.completed", "a".repeat(64)),
    ).state;
    state = machine.evaluate(
      state,
      evidence("unrelated.kind", "b".repeat(64)),
    ).state;
    const history = machine.historyOf(state);
    expect(history).toHaveLength(2);
    expect(history[0]?.step).toBe(1);
    expect(history[1]?.step).toBe(2);
    expect(history[1]?.matchedRuleIds).toEqual([]);
    expect(
      machine.evidenceDigestOf(evidence("unrelated.kind", "b".repeat(64))),
    ).toBe(history[1]?.evidenceDigest);
  });

  it("overviewOf projects counts, accepted roles and evidence kinds without machine internals", () => {
    const machine = init(defaultDiscoveryPolicy());
    let state = machine.initialState();
    for (let i = 0; i < 3; i++) {
      state = machine.evaluate(
        state,
        evidence("task.completed", `${i}`.padEnd(64, "0")),
      ).state;
    }
    const overview = machine.overviewOf(state);
    expect(overview.step).toBe(3);
    expect(overview.evidenceObserved).toBe(3);
    expect(overview.observationCount).toBe(3);
    expect(overview.acceptedCapabilityCount).toBe(1);
    expect(overview.rejectedCandidateCount).toBe(2);
    expect(overview.acceptedRoles).toEqual([
      { roleId: "capability.role/solution-synthesis", count: 1 },
    ]);
    expect(overview.evidenceKinds).toEqual([
      { kind: "task.completed", count: 3 },
    ]);
    expect(overview.stateDigest).toBe(machine.stateDigestOf(state));
    // standalone projection works without the machine
    expect(overviewOf(state).stateDigest).toBe(overview.stateDigest);
    expect(Object.isFrozen(overview)).toBe(true);
  });

  it("non-matching evidence still advances history with an empty result", () => {
    const machine = init(defaultDiscoveryPolicy());
    const state = machine.initialState();
    const evaluation = machine.evaluate(
      state,
      evidence("nothing.here", "z".repeat(64)),
    );
    expect(evaluation.result.matchedRuleIds).toEqual([]);
    expect(evaluation.result.accepted).toEqual([]);
    expect(evaluation.result.rejected).toEqual([]);
    expect(evaluation.state.history).toHaveLength(1);
    expect(evaluation.state.observations).toHaveLength(0);
  });

  it("evaluate validates the evidence shape", () => {
    const machine = init(defaultDiscoveryPolicy());
    const state = machine.initialState();
    expect(() =>
      machine.evaluate(state, { kind: "", payloadDigest: "x", sourceRefs: [] }),
    ).toThrow(/kind/);
    expect(() =>
      machine.evaluate(state, { kind: "k", payloadDigest: "", sourceRefs: [] }),
    ).toThrow(/payloadDigest/);
    expect(() =>
      machine.evaluate(state, {
        kind: "k",
        payloadDigest: "x",
        sourceRefs: "no" as unknown as [],
      }),
    ).toThrow(/sourceRefs/);
  });
});
