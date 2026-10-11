import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceStep,
  canonicalJson,
  expire,
  historyOf,
  init,
  request,
  resolve,
  serializeState,
  stateDigest,
  type EscalationOutcome,
} from '../src/index.js';
import { baseQuestion, fullResponse, openPolicy } from './helpers.js';

const TIMESTAMP_LIKE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function runSequence(): { serialized: string; digest: string; outcomes: string; history: string } {
  let state = init(openPolicy());
  const outcomes: EscalationOutcome[] = [];
  const first = request(state, baseQuestion());
  state = first.state;
  const accepted = resolve(state, fullResponse(first.request.id));
  state = accepted.state;
  outcomes.push(accepted.outcome);
  state = advanceStep(state);
  const second = request(state, baseQuestion({ body: 'Second question about glTF mesh deduplication.', requestedExpertise: ['gltf'] }));
  state = second.state;
  const expired = expire(state, second.request.id);
  state = expired.state;
  outcomes.push(expired.outcome);
  return {
    serialized: serializeState(state),
    digest: stateDigest(state),
    outcomes: canonicalJson(outcomes),
    history: canonicalJson(historyOf(state)),
  };
}

test('identical request/response sequences yield byte-identical state serializations', () => {
  assert.equal(runSequence().serialized, runSequence().serialized);
});

test('identical sequences yield identical state digests, outcomes and histories', () => {
  const first = runSequence();
  const second = runSequence();
  assert.equal(first.digest, second.digest);
  assert.equal(first.outcomes, second.outcomes);
  assert.equal(first.history, second.history);
});

test('canonicalJson is key-order independent', () => {
  assert.equal(
    canonicalJson({ b: 1, a: { z: 2, y: 3 } }),
    canonicalJson({ a: { y: 3, z: 2 }, b: 1 }),
  );
});

test('divergent sequences yield divergent digests', () => {
  const first = request(init(openPolicy()), baseQuestion()).state;
  const second = request(init(openPolicy()), baseQuestion({ body: 'A slightly different unresolved question.' })).state;
  assert.notEqual(stateDigest(first), stateDigest(second));
});

test('machine transitions never read the wall clock or randomness', () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = (): number => {
    throw new Error('Date.now called inside the escalation machine');
  };
  Math.random = (): number => {
    throw new Error('Math.random called inside the escalation machine');
  };
  try {
    const state = init(openPolicy());
    const result = request(state, baseQuestion());
    resolve(result.state, fullResponse(result.request.id));
    advanceStep(result.state);
    expire(result.state, result.request.id);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

test('a response-free state serialization contains no timestamp-like strings', () => {
  let state = init(openPolicy());
  const result = request(state, baseQuestion());
  state = result.state;
  state = expire(state, result.request.id).state;
  state = advanceStep(state);
  assert.equal(TIMESTAMP_LIKE.test(serializeState(state)), false);
});

test('each transition links to its predecessor digest (audit chain)', () => {
  let state = init(openPolicy());
  const digestZero = stateDigest(state);
  const asked = request(state, baseQuestion());
  assert.equal(asked.state.parentDigest, digestZero);
  const digestOne = stateDigest(asked.state);
  const resolved = resolve(asked.state, fullResponse(asked.request.id));
  assert.equal(resolved.state.parentDigest, digestOne);
});

test('step and serial counters only ever increase', () => {
  let state = init(openPolicy());
  const steps: number[] = [state.step];
  const serials: number[] = [state.serial];
  state = request(state, baseQuestion()).state;
  serials.push(state.serial);
  state = advanceStep(state);
  steps.push(state.step);
  state = request(state, baseQuestion({ body: 'Second question.' })).state;
  serials.push(state.serial);
  state = resolve(state, fullResponse('req-00000001')).state;
  state = expire(state, 'req-00000002').state;
  state = advanceStep(state);
  steps.push(state.step);
  assert.deepEqual(steps, [0, 1, 2]);
  assert.deepEqual(serials, [0, 1, 2]);
});
