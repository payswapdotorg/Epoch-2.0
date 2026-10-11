/**
 * W022 tests — no second semantic authority: the machine cannot mutate a
 * WorldRevision it references, state references world artifacts by digest
 * only, contracts are provider-neutral, and the environment limits are
 * declared honestly.
 */

import * as assert from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_LIFECYCLE_POLICY_ID,
  LIFECYCLE_PACKAGE_DESCRIPTOR,
  LIFECYCLE_PHASE_ORDER,
  LIFECYCLE_SNAPSHOT_FORMAT,
  LifecycleError,
  attachRevision,
  attachSolution,
  attachSurface,
  bindWorldStore,
  canonicalizeLifecycleState,
  init,
  lifecycleStateDigest,
  restoreLifecycle,
  saveLifecycle,
} from "../src/index.ts";

test("no second authority: the machine cannot mutate a WorldRevision it references", () => {
  const revision = Object.freeze({
    digest: "sha256:revision-1",
    parent: null,
    entities: [{ id: "wall-1", kind: "wall" }],
  });
  const before = JSON.stringify(revision);
  const anchor = attachRevision(revision);
  assert.deepStrictEqual(anchor, { kind: "revision", digest: "sha256:revision-1" });
  const machine = init();
  let state = machine.open(anchor);
  state = machine.record(state, {
    kind: "observation",
    note: "observed the revision",
    provenance: ["w022-test"],
    evidence: [revision.digest],
  });
  state = machine.advance(state, { to: "decide", reason: "understood", evidence: ["e:1"] });
  state = machine.record(state, { kind: "decision", note: "proceed", provenance: ["w022-test"], evidence: ["e:2"] });
  assert.strictEqual(JSON.stringify(revision), before);
  assert.ok(!canonicalizeLifecycleState(state).includes("wall-1"));
  assert.ok(!canonicalizeLifecycleState(state).includes("entities"));
});

test("no second authority: lifecycle state references world artifacts by digest only", () => {
  const machine = init();
  const revisionA = { digest: "sha256:same-digest", payload: "A" };
  const revisionB = { digest: "sha256:same-digest", payload: "B" };
  const left = machine.open(attachRevision(revisionA));
  const right = machine.open(attachRevision(revisionB));
  assert.strictEqual(canonicalizeLifecycleState(left), canonicalizeLifecycleState(right));
  assert.strictEqual(lifecycleStateDigest(left), lifecycleStateDigest(right));
  assert.deepStrictEqual(attachSolution("sha256:solution-9"), { kind: "solution", digest: "sha256:solution-9" });
  assert.deepStrictEqual(attachSurface({ digest: "sha256:surface-9" }), { kind: "surface", digest: "sha256:surface-9" });
  assert.throws(
    () => attachRevision({ noDigestHere: true } as unknown as { digest: string }),
    (error: unknown) => error instanceof LifecycleError && error.code === "invalid-anchor",
  );
});

test("provider-neutral: the machine and the persistence port run against arbitrary digest providers and stores", async () => {
  const machine = init();
  const digests = ["sha256:abc", "bafybeihash", "0123456789abcdef", "uuid-7b6f", "opaque-digest"];
  for (const digest of digests) {
    const state = machine.open({ kind: "solution", digest });
    const next = machine.advance(state, { to: "decide", reason: "provider-neutral", evidence: [digest] });
    assert.strictEqual(next.phase, "decide");
    assert.strictEqual(typeof lifecycleStateDigest(next), "string");
  }
  class SaveLoadStore {
    readonly #entries = new Map<string, string>();

    async save(key: string, bytes: string): Promise<void> {
      this.#entries.set(key, bytes);
    }

    async load(key: string): Promise<string | null> {
      return this.#entries.get(key) ?? null;
    }
  }
  const store = bindWorldStore(new SaveLoadStore() as unknown as Parameters<typeof bindWorldStore>[0]);
  const state = machine.open({ kind: "solution", digest: "sha256:any-provider" });
  const advanced = machine.advance(state, { to: "decide", reason: "r", evidence: ["e"] });
  const snapshot = await saveLifecycle(store, advanced);
  const restored = await restoreLifecycle(store, snapshot.stateDigest);
  assert.ok(restored !== null);
  assert.strictEqual(canonicalizeLifecycleState(restored), canonicalizeLifecycleState(advanced));
});

test("honest environment limits: the descriptor declares no clock, randomness, network, filesystem, world writes, model calls or training", () => {
  const descriptor = LIFECYCLE_PACKAGE_DESCRIPTOR;
  assert.strictEqual(descriptor.name, "@zcode/epoch-lifecycle");
  assert.strictEqual(descriptor.workOrder, "W022");
  assert.deepStrictEqual([...descriptor.phaseOrder], [...LIFECYCLE_PHASE_ORDER]);
  assert.strictEqual(descriptor.defaultPolicyId, DEFAULT_LIFECYCLE_POLICY_ID);
  assert.strictEqual(descriptor.snapshotFormat, LIFECYCLE_SNAPSHOT_FORMAT);
  const constraints = descriptor.constraints;
  assert.strictEqual(constraints.timestamps, false);
  assert.strictEqual(constraints.wallClock, false);
  assert.strictEqual(constraints.randomness, false);
  assert.strictEqual(constraints.network, false);
  assert.strictEqual(constraints.filesystem, false);
  assert.strictEqual(constraints.worldWrites, false);
  assert.strictEqual(constraints.modelCalls, false);
  assert.strictEqual(constraints.training, false);
});
