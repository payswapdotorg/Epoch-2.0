import { describe, expect, it } from "vitest";
import type { WorldRevision } from "@zcode/epoch-world-model";
import {
  canonicalJSON,
  deepFreeze,
  defaultDiscoveryPolicy,
  init,
  revisionEvidence,
} from "../src/index.ts";
import type { CapabilityEvidence } from "../src/index.ts";

function collectCallables(
  value: unknown,
  path = "$",
  found: string[] = [],
): string[] {
  if (typeof value === "function") found.push(path);
  if (value === null || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    collectCallables(child, `${path}.${key}`, found);
  }
  return found;
}

describe("no execution authority", () => {
  it("the machine cannot mutate a WorldRevision it never receives", () => {
    const revision = deepFreeze({
      id: "revision-1",
      world: { entities: [], relations: [] },
    } as unknown as WorldRevision);
    const revisionBefore = canonicalJSON(revision);
    const machine = init(defaultDiscoveryPolicy());
    // Only the DIGEST of the revision enters discovery — never the content.
    const evidence = revisionEvidence(revision);
    const evaluation = machine.evaluate(machine.initialState(), evidence);
    expect(evaluation.state.capabilities).toHaveLength(0); // no default rule matches revision.evaluated
    expect(evaluation.state.observations).toHaveLength(0);
    expect(canonicalJSON(revision)).toBe(revisionBefore);
    expect(Object.isFrozen(revision)).toBe(true);
  });

  it("discovery results are declarations: no callable members anywhere in the state", () => {
    const machine = init(defaultDiscoveryPolicy());
    let state = machine.initialState();
    for (let i = 0; i < 3; i++) {
      state = machine.evaluate(state, {
        kind: "task.completed",
        payloadDigest: `r${i}`.padEnd(64, "0"),
        sourceRefs: [],
      }).state;
    }
    expect(collectCallables(state)).toEqual([]);
    expect(state.capabilities[0]).toBeDefined();
    expect(Object.isFrozen(state.capabilities[0])).toBe(true);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("a discovered capability is data: JSON round-trips losslessly", () => {
    const machine = init(defaultDiscoveryPolicy());
    let state = machine.initialState();
    for (let i = 0; i < 3; i++) {
      state = machine.evaluate(state, {
        kind: "task.completed",
        payloadDigest: `j${i}`.padEnd(64, "0"),
        sourceRefs: [],
      }).state;
    }
    const capability = state.capabilities[0];
    expect(capability).toBeDefined();
    expect(JSON.parse(JSON.stringify(capability))).toEqual(capability);
    expect(capability?.id.startsWith("capability/")).toBe(true);
    expect(capability?.evidenceRefs).toHaveLength(3);
  });

  it("evaluate never mutates the caller-supplied evidence", () => {
    const machine = init(defaultDiscoveryPolicy());
    const evidence: CapabilityEvidence = deepFreeze({
      kind: "task.completed",
      payloadDigest: "q".repeat(64),
      sourceRefs: [{ label: "src" }],
    });
    const before = canonicalJSON(evidence);
    machine.evaluate(machine.initialState(), evidence);
    expect(canonicalJSON(evidence)).toBe(before);
    expect(Object.isFrozen(evidence)).toBe(true);
  });
});
