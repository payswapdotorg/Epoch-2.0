import { describe, expect, it } from 'vitest';
import type { WorldStore } from '@zcode/epoch-persistence';
import {
  bindWorldStore,
  canonicalJSON,
  createInMemoryDiscoveryStore,
  defaultDiscoveryPolicy,
  definePolicy,
  discoveryPersistence,
  init,
  restoreSnapshot,
  snapshotOf,
} from '../src/index.ts';
import type { DiscoveryMachine, DiscoveryState, PersistedDiscoverySnapshot } from '../src/index.ts';

function stateAfter(...kinds: string[]): { machine: DiscoveryMachine; state: DiscoveryState } {
  const machine = init(defaultDiscoveryPolicy());
  let state = machine.initialState();
  for (let i = 0; i < kinds.length; i++) {
    state = machine.evaluate(state, { kind: kinds[i] as string, payloadDigest: `s${i}`.padEnd(64, '0'), sourceRefs: [] }).state;
  }
  return { machine, state };
}

describe('persistence through the WorldStore port (digest-keyed)', () => {
  it('snapshots round-trip through the in-memory discovery store by digest', async () => {
    const { machine, state } = stateAfter('task.completed', 'task.completed', 'task.completed');
    const store = createInMemoryDiscoveryStore();
    const persistence = discoveryPersistence(store);
    const snapshot = await persistence.save(state);
    expect(snapshot.digest).toBe(machine.stateDigestOf(state));
    expect(store.size).toBe(1);
    const restored = await persistence.restore(snapshot.digest, machine);
    expect(restored).not.toBeNull();
    expect(restored).not.toBe(state); // re-attached by digest, not by mutable pointer
    expect(canonicalJSON(restored)).toBe(canonicalJSON(state));
    expect(machine.stateDigestOf(restored as DiscoveryState)).toBe(snapshot.digest);
    expect(await persistence.snapshots()).toEqual([snapshot.digest]);
  });

  it('restore returns null for unknown digests and foreign entries', async () => {
    const store = createInMemoryDiscoveryStore();
    const persistence = discoveryPersistence(store);
    const { machine, state } = stateAfter('task.completed');
    await persistence.save(state);
    expect(await persistence.restore('0'.repeat(64), machine)).toBeNull();

    // a WorldStore-shaped store holding a foreign (non-discovery) entry
    const entries = new Map<string, unknown>();
    const worldLike = {
      save: (entry: { digest: string }): void => {
        entries.set(entry.digest, entry);
      },
      load: (digest: string): unknown => entries.get(digest) ?? null,
    };
    entries.set('f'.repeat(64), { kind: 'epoch.revision', digest: 'f'.repeat(64) });
    const bridged = discoveryPersistence(bindWorldStore(worldLike as unknown as WorldStore));
    expect(await bridged.restore('f'.repeat(64), machine)).toBeNull();
  });

  it('tampered snapshots are rejected by digest validation', async () => {
    const { state } = stateAfter('task.completed');
    const snapshot = snapshotOf(state);
    const tampered = { ...snapshot, state: { ...state, step: 99 } };
    expect(() => restoreSnapshot(tampered)).toThrow(/digest mismatch/);

    const store = createInMemoryDiscoveryStore();
    const persistence = discoveryPersistence(store);
    await persistence.save(state);
    const keys = await persistence.snapshots();
    const otherMachine = init(
      definePolicy({
        rules: [
          {
            id: 'rule/other',
            description: 'other',
            match: {},
            candidate: { roleId: 'capability.role/other', scope: { appliesTo: ['task'] } },
            weight: 1,
          },
        ],
      }),
    );
    await expect(persistence.restore(keys[0] as string, otherMachine)).rejects.toThrow(/policy/);
  });

  it('bindWorldStore bridges save/load-style WorldStores and re-attaches into a fresh machine', async () => {
    const entries = new Map<string, PersistedDiscoverySnapshot>();
    const worldStore = {
      save: (entry: PersistedDiscoverySnapshot): void => {
        entries.set(entry.digest, entry);
      },
      load: (digest: string): PersistedDiscoverySnapshot | null => entries.get(digest) ?? null,
    };
    const persistence = discoveryPersistence(bindWorldStore(worldStore as unknown as WorldStore));
    const { machine, state } = stateAfter('task.completed', 'task.completed', 'task.completed');
    const snapshot = await persistence.save(state);
    const restored = await persistence.restore(snapshot.digest, machine);
    expect(restored).not.toBeNull();
    expect(canonicalJSON(restored)).toBe(canonicalJSON(state));
    // a NEW machine instance built from the same (deterministic) policy re-attaches by digest
    const freshMachine = init(defaultDiscoveryPolicy());
    const restoredAgain = await persistence.restore(snapshot.digest, freshMachine);
    expect(canonicalJSON(restoredAgain)).toBe(canonicalJSON(state));
  });

  it('bindWorldStore bridges put/get-style WorldStores (async)', async () => {
    const entries = new Map<string, unknown>();
    const worldStore = {
      put: async (entry: { digest: string }): Promise<void> => {
        entries.set(entry.digest, entry);
      },
      get: async (digest: string): Promise<unknown> => entries.get(digest) ?? null,
      keys: (): string[] => [...entries.keys()],
    };
    const persistence = discoveryPersistence(bindWorldStore(worldStore as unknown as WorldStore));
    const { machine, state } = stateAfter('task.failed');
    const snapshot = await persistence.save(state);
    expect(await persistence.snapshots()).toContain(snapshot.digest);
    const restored = await persistence.restore(snapshot.digest, machine);
    expect(canonicalJSON(restored)).toBe(canonicalJSON(state));
  });

  it('bindWorldStore throws a descriptive error for unbindable stores', () => {
    expect(() => bindWorldStore({} as unknown as WorldStore)).toThrow(/could not bind/i);
    expect(() => bindWorldStore({ save: () => {} } as unknown as WorldStore)).toThrow(/could not bind/i);
    expect(() => bindWorldStore(null as unknown as WorldStore)).toThrow(/WorldStore/);
  });
});
