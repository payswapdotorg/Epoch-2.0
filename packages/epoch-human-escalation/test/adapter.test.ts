import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DETERMINISTIC_EPOCH,
  EscalationError,
  EscalationSession,
  InMemoryEscalationAdapter,
  init,
  request,
  resolve,
} from '../src/index.js';
import { baseQuestion, fullResponse, missing, openPolicy } from './helpers.js';

test('the in-memory adapter stamps its provider identity into response provenance', async () => {
  const adapter = new InMemoryEscalationAdapter({
    providerId: 'mock-market',
    channel: 'queue',
    expertKey: 'expert-42',
    expertise: ['ifc'],
  });
  const asked = request(init(openPolicy()), baseQuestion({ requestedExpertise: ['ifc'] }));
  await adapter.submit(asked.request);
  const response = await adapter.awaitResponse(asked.request.id);
  assert.notEqual(response, null);
  if (response !== null) {
    assert.equal(response.answeredVia.providerId, 'mock-market');
    assert.equal(response.answeredVia.channel, 'queue');
    assert.equal(response.answeredBy.provenance.providerId, 'mock-market');
    assert.equal(response.answeredBy.provenance.expertKey, 'expert-42');
    assert.deepEqual([...response.answeredBy.expertise], ['ifc']);
    assert.equal(response.requestId, asked.request.id);
  }
});

test('the in-memory adapter is deterministic by default', async () => {
  const first = new InMemoryEscalationAdapter();
  const second = new InMemoryEscalationAdapter();
  const askedFirst = request(init(openPolicy()), baseQuestion());
  const askedSecond = request(init(openPolicy()), baseQuestion());
  await first.submit(askedFirst.request);
  await second.submit(askedSecond.request);
  const responseFirst = await first.awaitResponse(askedFirst.request.id);
  const responseSecond = await second.awaitResponse(askedSecond.request.id);
  assert.deepEqual(responseFirst, responseSecond);
  assert.equal(responseFirst?.answeredVia.answeredAt, DETERMINISTIC_EPOCH);
});

test('submit returns a receipt referencing the request', async () => {
  const adapter = new InMemoryEscalationAdapter({ providerId: 'mock-market', channel: 'queue' });
  const asked = request(init(openPolicy()), baseQuestion());
  const receipt = await adapter.submit(asked.request);
  assert.equal(receipt.providerId, 'mock-market');
  assert.equal(receipt.requestId, asked.request.id);
  assert.equal(receipt.channel, 'queue');
  assert.equal(receipt.acceptedAt, DETERMINISTIC_EPOCH);
});

test('with autoRespond disabled responses stay pending until fulfilled', async () => {
  const adapter = new InMemoryEscalationAdapter({ autoRespond: false });
  const asked = request(init(openPolicy()), baseQuestion());
  await adapter.submit(asked.request);
  assert.equal(await adapter.awaitResponse(asked.request.id), null);
  const manual = fullResponse(asked.request.id, { answer: 'Manual answer.' });
  adapter.fulfill(asked.request.id, manual);
  assert.deepEqual(await adapter.awaitResponse(asked.request.id), manual);
});

test('injected malformed responses surface as typed provenance errors at resolve', async () => {
  const adapter = new InMemoryEscalationAdapter({ autoRespond: false });
  const asked = request(init(openPolicy()), baseQuestion());
  await adapter.submit(asked.request);
  adapter.fulfill(asked.request.id, missing(fullResponse(asked.request.id), 'answeredBy'));
  const response = await adapter.awaitResponse(asked.request.id);
  assert.notEqual(response, null);
  if (response !== null) {
    assert.throws(
      () => resolve(asked.state, response),
      (error: unknown) => error instanceof EscalationError && error.code === 'provenance-incomplete',
    );
  }
});

test('a full session flow accepts an in-memory expert response with full provenance', async () => {
  const adapter = new InMemoryEscalationAdapter({ expertise: ['ifc', 'construction'], confidence: 'high' });
  const session = EscalationSession.create({ policy: openPolicy(), adapter });
  const asked = await session.ask(baseQuestion());
  const outcomes = await session.collectResponses();
  assert.equal(outcomes.length, 1);
  const outcome = outcomes[0];
  assert.equal(outcome?.kind, 'accepted');
  if (outcome?.kind === 'accepted') {
    assert.equal(outcome.requestId, asked.request.id);
    assert.equal(outcome.response.answeredBy.provenance.providerId, 'in-memory');
    assert.equal(outcome.response.confidence, 'high');
  }
  assert.deepEqual(session.history().map((entry) => entry.status), ['resolved']);
});
