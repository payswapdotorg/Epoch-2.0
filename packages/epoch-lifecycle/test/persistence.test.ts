/**
 * W022 tests — persistence binding THROUGH the W021 WorldStore port:
 * snapshots keyed by digest, restore by digest (round-trip through an
 * in-memory WorldStore adapter), tamper detection, and the guarantee that
 * the lifecycle never writes world revisions.
 */

import * as assert from "node:assert";
import { test } from "node:test";
import {
  LIFECYCLE_SNAPSHOT_FORMAT,
  LifecycleError,
  bindWorldStore,
  canonicalizeLifecycleState,
  init,
  lifecycleSnapshotKey,
  lifecycleStateDigest,
  restoreLifecycle,
  saveLifecycle,
} from "../src/index.ts";
import { ANCHOR, walkTo } from "./helpers.ts";

class InMemoryWorldStoreAdapter {
  readonly #entries = new Map<string, string>();

  async put(key: string, bytes: string): Promise<void> {
    this.#entries.set(key, bytes);
  }

  async get(key: string): Promise<string | null> {
    return this.#entries.get(key) ?? null;
  }

  entries(): readonly (readonly [string, string])[] {
    return [...this.#entries.entries()];
  }
}

type WorldStoreLike = Parameters<typeof bindWorldStore>[0];

function buildState() {
  const machine = init();
  let state = machine.open(ANCHOR);
  state = machine.record(state, {
    kind: "observation",
    note: "observed",
    provenance: ["w022-test"],
    evidence: ["e:1"],
  });
  state = walkTo(machine, state, "plan");
  return state;
}

test("persistence: bindWorldStore adapts an in-memory WorldStore adapter through the probed put/get pair", async () => {
  const adapter = new InMemoryWorldStoreAdapter();
  const store = bindWorldStore(adapter as unknown as WorldStoreLike);
  await store.put("probe:key", "bytes");
  assert.strictEqual(await store.get("probe:key"), "bytes");
  assert.strictEqual(await store.get("probe:missing"), null);
});

test("persistence: bindWorldStore throws a typed persistence-binding error when no pair matches", () => {
  assert.throws(
    () => bindWorldStore({} as unknown as WorldStoreLike),
    (error: unknown) => error instanceof LifecycleError && error.code === "persistence-binding",
  );
});

test("persistence: saveLifecycle writes the canonical bytes keyed by the state digest", async () => {
  const adapter = new InMemoryWorldStoreAdapter();
  const store = bindWorldStore(adapter as unknown as WorldStoreLike);
  const state = buildState();
  const digest = lifecycleStateDigest(state);
  const snapshot = await saveLifecycle(store, state);
  assert.strictEqual(snapshot.format, LIFECYCLE_SNAPSHOT_FORMAT);
  assert.strictEqual(snapshot.stateDigest, digest);
  assert.strictEqual(snapshot.canonicalBytes, canonicalizeLifecycleState(state));
  assert.strictEqual(snapshot.anchorDigest, ANCHOR.digest);
  assert.strictEqual(snapshot.phase, "plan");
  const stored = new Map(adapter.entries());
  assert.deepStrictEqual([...stored.keys()], [lifecycleSnapshotKey(digest)]);
  assert.strictEqual(stored.get(lifecycleSnapshotKey(digest)), canonicalizeLifecycleState(state));
});

test("persistence: restoreLifecycle re-attaches by digest and round-trips exactly", async () => {
  const adapter = new InMemoryWorldStoreAdapter();
  const store = bindWorldStore(adapter as unknown as WorldStoreLike);
  const state = buildState();
  const snapshot = await saveLifecycle(store, state);
  const restored = await restoreLifecycle(store, snapshot.stateDigest);
  assert.ok(restored !== null);
  assert.deepStrictEqual(restored, state);
  assert.strictEqual(lifecycleStateDigest(restored), snapshot.stateDigest);
  const fresh = new InMemoryWorldStoreAdapter();
  const freshStore = bindWorldStore(fresh as unknown as WorldStoreLike);
  await saveLifecycle(freshStore, state);
  const restoredAgain = await restoreLifecycle(freshStore, snapshot.stateDigest);
  assert.ok(restoredAgain !== null);
  assert.strictEqual(canonicalizeLifecycleState(restoredAgain), canonicalizeLifecycleState(state));
});

test("persistence: restoring an unknown digest yields null, never a mutable pointer", async () => {
  const adapter = new InMemoryWorldStoreAdapter();
  const store = bindWorldStore(adapter as unknown as WorldStoreLike);
  assert.strictEqual(await restoreLifecycle(store, "sha256:never-saved"), null);
});

test("persistence: tampered stored bytes fail the digest check with a typed error", async () => {
  const adapter = new InMemoryWorldStoreAdapter();
  const store = bindWorldStore(adapter as unknown as WorldStoreLike);
  const state = buildState();
  const digest = lifecycleStateDigest(state);
  await saveLifecycle(store, state);
  await adapter.put(lifecycleSnapshotKey(digest), `${canonicalizeLifecycleState(state)} `);
  await assert.rejects(
    () => restoreLifecycle(store, digest),
    (error: unknown) => error instanceof LifecycleError && error.code === "serialization",
  );
});

test("persistence: the lifecycle never writes world revisions - snapshot keys are lifecycle-scoped", async () => {
  const adapter = new InMemoryWorldStoreAdapter();
  const store = bindWorldStore(adapter as unknown as WorldStoreLike);
  const machine = init();
  let first = machine.open(ANCHOR);
  first = walkTo(machine, first, "decide");
  let second = machine.open(ANCHOR);
  second = walkTo(machine, second, "plan");
  await saveLifecycle(store, first);
  await saveLifecycle(store, second);
  const keys = adapter.entries().map(([key]) => key);
  assert.strictEqual(keys.length, 2);
  assert.ok(keys.every((key) => key.startsWith("epoch-lifecycle:snapshot:")));
  assert.ok(keys.every((key) => key !== first.anchor.digest && key !== second.anchor.digest));
  const restored = await restoreLifecycle(store, lifecycleStateDigest(first));
  assert.ok(restored !== null);
  assert.strictEqual(restored.phase, "decide");
});
