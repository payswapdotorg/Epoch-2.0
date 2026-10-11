import { describe, expect, it } from "vitest";
import type { LifecycleEvent } from "@zcode/epoch-lifecycle";
import {
  canonicalDigest,
  canonicalJSON,
  deepFreeze,
  definePolicy,
  discoveryNote,
  init,
  lifecycleEvidence,
  lifecycleEventDigest,
} from "../src/index.ts";
import type { DiscoveryMachine, DiscoveryState } from "../src/index.ts";

const EVENTS = [
  { digest: "1".repeat(64), kind: "task.completed", phase: "Build" },
  { digest: "2".repeat(64), kind: "task.completed", phase: "Build" },
  { digest: "3".repeat(64), kind: "task.completed", phase: "Verify" },
  { digest: "4".repeat(64), kind: "task.failed", phase: "Verify" },
] as unknown as LifecycleEvent[];

function lifecycleMachine(): DiscoveryMachine {
  return init(
    definePolicy({
      rules: [
        {
          id: "rule/lifecycle-completions",
          description: "lifecycle task completions suggest solution synthesis",
          match: { evidenceKind: "lifecycle.task.completed" },
          candidate: {
            roleId: "capability.role/solution-synthesis",
            scope: { appliesTo: ["task"] },
          },
          weight: 1,
        },
      ],
      promotion: { minEvidenceCount: 3, minConfidence: 0.5, maxConfidence: 1 },
    }),
  );
}

function runEvents(): DiscoveryState {
  const machine = lifecycleMachine();
  let state = machine.initialState();
  for (const ev of lifecycleEvidence(EVENTS)) {
    state = machine.evaluate(state, ev).state;
  }
  return state;
}

describe("lifecycle evidence consumption (read-only)", () => {
  it("lifecycle evidence is derived from lifecycle events by digest (read-only)", () => {
    const evidence = lifecycleEvidence(EVENTS);
    expect(evidence).toHaveLength(4);
    expect(evidence[0]?.kind).toBe("lifecycle.task.completed");
    expect(evidence[0]?.payloadDigest).toBe("1".repeat(64));
    expect(evidence[0]?.sourceRefs).toEqual([
      { lifecycleEventDigest: "1".repeat(64) },
    ]);
    expect(evidence[3]?.kind).toBe("lifecycle.task.failed");
    expect(evidence[3]?.payloadDigest).toBe("4".repeat(64));
  });

  it("lifecycle events are never mutated by evidence derivation", () => {
    const frozen = deepFreeze(EVENTS.map((event) => ({ ...event })));
    const before = canonicalJSON(frozen);
    lifecycleEvidence(frozen);
    expect(canonicalJSON(frozen)).toBe(before);
    expect(() => {
      (frozen[0] as unknown as { digest: string }).digest = "x";
    }).toThrow();
  });

  it("discoveryNote is a structured, provenance-bearing Learn-phase note", () => {
    const machine = lifecycleMachine();
    const state = runEvents();
    expect(state.capabilities).toHaveLength(1);
    const note = discoveryNote(state);
    expect(note.kind).toBe("epoch.discovery-note");
    expect(note.version).toBe(1);
    expect(note.sessionId).toBe(state.sessionId);
    expect(note.step).toBe(state.step);
    expect(note.capabilityIds).toEqual(
      state.capabilities.map((capability) => capability.id),
    );
    expect(note.roles).toEqual(["capability.role/solution-synthesis"]);
    expect(note.evidenceDigests).toEqual([
      "1".repeat(64),
      "2".repeat(64),
      "3".repeat(64),
    ]);
    expect(note.stateDigest).toBe(machine.stateDigestOf(state));
    expect(() => canonicalJSON(note)).not.toThrow();
    expect(Object.isFrozen(note)).toBe(true);
    // the note is data, not world content
    const serialized = canonicalJSON(note);
    expect(serialized).not.toContain("entities");
    expect(serialized).not.toContain("world");
  });

  it("lifecycle-derived evidence streams drive deterministic discovery", () => {
    expect(canonicalJSON(runEvents())).toBe(canonicalJSON(runEvents()));
  });

  it("digest and kind extraction degrade deterministically for minimal events", () => {
    const bare = { kind: "task.completed" } as unknown as LifecycleEvent;
    const digest = lifecycleEventDigest(bare);
    expect(digest).toBe(canonicalDigest(bare));
    expect(digest).toHaveLength(64);
    const plain = {} as unknown as LifecycleEvent;
    expect(lifecycleEvidence([plain])[0]?.kind).toBe("lifecycle.transition");
    expect(lifecycleEvidence([plain])[0]?.payloadDigest).toBe(
      canonicalDigest(plain),
    );
  });
});
