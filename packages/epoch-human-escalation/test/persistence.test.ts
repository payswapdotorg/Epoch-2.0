import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TextEncoder } from 'node:util';
import {
  EscalationError,
  EscalationSession,
  InMemoryEscalationAdapter,
  InMemoryWorldStore,
  init,
  persistState,
  request,
  resolve,
  restoreState,
  serializeState,
  sessionKey,
  stateDigest,
} from '../src/index.js';
import { baseQuestion, fullResponse, openPolicy } from './helpers.js';

test('escalation state round-trips through the in-memory WorldStore byte-identically', async () => {
  const store = new InMemoryWorldStore();
  const asked = request(init(openPolicy()), baseQuestion());
  const state = resolve(asked.state, fullResponse(asked.request.id)).state;
  const digest = await persistState(store, state);
  const restored = await restoreState(store, digest);
  assert.equal(serializeState(restored), serializeState(state));
  assert.equal(stateDigest(restored), digest);
});

test('a session restores by digest and continues from the restored state', async () => {
  const store = new InMemoryWorldStore();
  const adapter = new InMemoryEscalationAdapter({ expertise: ['ifc', 'construction'] });
  const first = EscalationSession.create({ policy: openPolicy(), store, grants: { persist: true }, adapter });
  await first.ask(baseQuestion());
  await first.collectResponses();
  const digest = first.snapshotDigest();

  const second = EscalationSession.create({ policy: openPolicy(), store, grants: { persist: true }, adapter });
  await second.restore(digest);
  assert.equal(serializeState(second.state()), serializeState(first.state()));

  const followUp = await second.ask(baseQuestion({ body: 'Follow-up question after restore.' }));
  assert.equal(followUp.request.serial, 2);

  const third = EscalationSession.create({ policy: openPolicy(), store, adapter });
  await third.restore(second.snapshotDigest());
  assert.equal(third.state().serial, 2);
});

test('restore rejects a session persisted under a different policy (policy-mismatch)', async () => {
  const store = new InMemoryWorldStore();
  const state = request(init(openPolicy()), baseQuestion()).state;
  const digest = await persistState(store, state);
  await assert.rejects(
    () => restoreState(store, digest, { policy: openPolicy({ minConfidence: 'high' }) }),
    (error: unknown) => error instanceof EscalationError && error.code === 'policy-mismatch',
  );
});

test('restore detects corrupted bytes (state-corrupt)', async () => {
  const store = new InMemoryWorldStore();
  const digest = 'e'.repeat(64);
  await store.put(sessionKey(digest), new TextEncoder().encode('{"policy":{}'));
  await assert.rejects(
    () => restoreState(store, digest),
    (error: unknown) => error instanceof EscalationError && error.code === 'state-corrupt',
  );
  await store.put(sessionKey(digest), new TextEncoder().encode('definitely not json'));
  await assert.rejects(
    () => restoreState(store, digest),
    (error: unknown) => error instanceof EscalationError && error.code === 'state-corrupt',
  );
});

test('restore detects a digest-key mismatch (state-corrupt)', async () => {
  const store = new InMemoryWorldStore();
  const state = request(init(openPolicy()), baseQuestion()).state;
  await store.put(sessionKey('f'.repeat(64)), new TextEncoder().encode(serializeState(state)));
  await assert.rejects(
    () => restoreState(store, 'f'.repeat(64)),
    (error: unknown) => error instanceof EscalationError && error.code === 'state-corrupt',
  );
});

test('without the persist grant a session never touches the WorldStore (default-deny)', async () => {
  const store = new InMemoryWorldStore();
  const session = EscalationSession.create({
    policy: openPolicy(),
    store,
    adapter: new InMemoryEscalationAdapter(),
  });
  await session.ask(baseQuestion());
  await session.collectResponses();
  assert.equal(store.putCount(), 0);
  assert.deepEqual(store.keys(), []);
});

test('with the persist grant every change is stored under its own digest key', async () => {
  const store = new InMemoryWorldStore();
  const session = EscalationSession.create({
    policy: openPolicy(),
    store,
    grants: { persist: true },
    adapter: new InMemoryEscalationAdapter(),
  });
  await session.ask(baseQuestion());
  await session.collectResponses();
  const keys = store.keys();
  assert.ok(keys.length >= 2);
  for (const key of keys) {
    assert.ok(key.startsWith('epoch.escalation/session/'), `unexpected key ${key}`);
  }
  assert.deepEqual([...session.auditDigests().map((digest) => sessionKey(digest))].sort(), [...keys].sort());
});
