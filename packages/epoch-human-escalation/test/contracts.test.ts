import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESCALATION_POLICY,
  ESCALATION_REQUEST_STATUSES,
  init,
  request,
  type EscalationOutcome,
  type ExpertProfile,
} from '../src/index.js';
import { baseQuestion, fullResponse, openPolicy } from './helpers.js';

test('ExpertProfile is provider-neutral: expertise + provenance only, no identity assumptions', () => {
  const profile: ExpertProfile = {
    expertise: ['ifc'],
    provenance: { providerId: 'any-provider', expertKey: 'opaque-handle' },
  };
  assert.deepEqual(Object.keys(profile).sort(), ['expertise', 'provenance']);
  for (const identityField of ['name', 'email', 'displayName', 'userId', 'account']) {
    assert.equal(identityField in profile, false, `profile must not assume identity field "${identityField}"`);
  }
});

test('ExpertResponse carries who/via/when/confidence provenance', () => {
  const response = fullResponse('req-00000001');
  assert.equal(typeof response.answer, 'string');
  assert.equal(response.confidence, 'high');
  assert.deepEqual(Object.keys(response.answeredVia).sort(), ['answeredAt', 'channel', 'providerId']);
  assert.equal(response.answeredBy.provenance.providerId, 'test-provider');
  assert.equal(response.answeredBy.provenance.expertKey, 'expert-7');
  assert.equal(response.answeredVia.answeredAt, '2026-07-01T10:00:00.000Z');
});

test('EscalationOutcome discriminates accepted / rejected / expired variants', () => {
  const accepted: EscalationOutcome = { kind: 'accepted', requestId: 'req-00000001', response: fullResponse('req-00000001') };
  const rejected: EscalationOutcome = { kind: 'rejected', requestId: 'req-00000001', reason: 'request-not-open' };
  const expired: EscalationOutcome = { kind: 'expired', requestId: 'req-00000001', expiredAtStep: 3 };
  assert.equal(accepted.kind, 'accepted');
  assert.equal(rejected.kind, 'rejected');
  assert.equal(expired.kind, 'expired');
});

test('EscalationPolicy expresses kinds, thresholds and rate limits as data', () => {
  assert.deepEqual(Object.keys(DEFAULT_ESCALATION_POLICY).sort(), [
    'allowedQuestionKinds',
    'expirySteps',
    'maxQuestionBodyChars',
    'minConfidence',
    'minContextSnapshots',
    'minEvidenceRefs',
    'minQuestionBodyChars',
    'minRequestedExpertiseTags',
    'rateLimits',
    'requireExpertiseOverlap',
  ]);
  assert.deepEqual(Object.keys(DEFAULT_ESCALATION_POLICY.rateLimits).sort(), [
    'maxNewRequestsPerStep',
    'maxOpenRequests',
  ]);
});

test('EscalationRequest carries the question, evidence-by-digest, context snapshots and requested expertise', () => {
  const result = request(init(openPolicy()), baseQuestion());
  assert.equal(typeof result.request.id, 'string');
  assert.equal(result.request.openedAtStep, 0);
  assert.equal(result.request.serial, 1);
  assert.equal(result.request.question.evidence[0]?.digest.length, 64);
  assert.equal(result.request.question.contextSnapshots[0]?.digest.length, 64);
  assert.deepEqual([...result.request.question.requestedExpertise], ['ifc', 'construction']);
  assert.equal(result.state.requests[result.request.id].status, 'open');
  assert.deepEqual([...ESCALATION_REQUEST_STATUSES], ['open', 'resolved', 'expired']);
});
