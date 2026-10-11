import {
  CONFIDENCE_LEVELS,
  type EscalatedRequestRecord,
  type EscalationOutcome,
  type EscalationPolicy,
  type EscalationQuestion,
  type EscalationRequest,
  type EscalationState,
  type ExpertResponse,
} from './contracts.js';
import { EscalationError } from './errors.js';
import { isNonEmptyString, isOneOf, isRecord } from './guards.js';
import { bumpRejections, field, hasOverlap, lookup, withRecord } from './machine-internal.js';
import { confidenceRank, validatePolicy, validateQuestion } from './machine-policy.js';
import { enforceRateLimits } from './machine-rate.js';
import { digestOf, stateDigest } from './serialize.js';

/**
 * Core request/response state machine: `init`, `request`, `resolve`.
 * Pure and deterministic; expert responses enter as provenance-bearing input
 * and are stored only inside escalation records (no world reference, no
 * world mutation — no second authority).
 */

/** init(policy) → machine state. Validates the policy; invalid policy is a typed error. */
export function init(policy: EscalationPolicy): EscalationState {
  validatePolicy(policy);
  return { policy, policyDigest: digestOf(policy), step: 0, serial: 0, requests: {} };
}

/** request(state, question) → state + request. Policy violations are typed errors. */
export function request(
  state: EscalationState,
  question: EscalationQuestion,
): { state: EscalationState; request: EscalationRequest } {
  validateQuestion(state.policy, question);
  enforceRateLimits(state);
  const serial = state.serial + 1;
  const id = `req-${String(serial).padStart(8, '0')}`;
  const escalationRequest: EscalationRequest = {
    id,
    kind: question.kind,
    question,
    serial,
    openedAtStep: state.step,
  };
  const record: EscalatedRequestRecord = { request: escalationRequest, status: 'open', rejectionCount: 0 };
  return {
    state: {
      ...state,
      serial,
      parentDigest: stateDigest(state),
      requests: { ...state.requests, [id]: record },
    },
    request: escalationRequest,
  };
}

/** resolve(state, response) → state + outcome. A response without provenance is a typed error. */
export function resolve(
  state: EscalationState,
  response: ExpertResponse,
): { state: EscalationState; outcome: EscalationOutcome } {
  validateResponseShape(response);
  const record = lookup(state, response.requestId);
  if (record === undefined) {
    return { state, outcome: { kind: 'rejected', requestId: response.requestId, reason: 'unknown-request' } };
  }
  if (record.status !== 'open') {
    return { state, outcome: { kind: 'rejected', requestId: response.requestId, reason: 'request-not-open' } };
  }
  if (confidenceRank(response.confidence) < confidenceRank(state.policy.minConfidence)) {
    return {
      state: bumpRejections(state, response.requestId),
      outcome: { kind: 'rejected', requestId: response.requestId, reason: 'confidence-below-threshold' },
    };
  }
  if (
    state.policy.requireExpertiseOverlap &&
    !hasOverlap(record.request.question.requestedExpertise, response.answeredBy.expertise)
  ) {
    return {
      state: bumpRejections(state, response.requestId),
      outcome: { kind: 'rejected', requestId: response.requestId, reason: 'expertise-mismatch' },
    };
  }
  const updated: EscalatedRequestRecord = {
    ...record,
    status: 'resolved',
    acceptedResponse: response,
    resolvedAtStep: state.step,
  };
  return {
    state: withRecord(state, response.requestId, updated),
    outcome: { kind: 'accepted', requestId: response.requestId, response },
  };
}

// --- response shape + provenance enforcement (used by resolve) -------------

function validateResponseShape(response: ExpertResponse): void {
  if (!isRecord(response)) {
    throw new EscalationError('response-invalid', 'expert response must be an object', [field('response', 'not an object')]);
  }
  if (!isNonEmptyString(response.requestId)) {
    throw new EscalationError('response-invalid', 'expert response must reference a request id', [
      field('requestId', 'must be a non-empty string'),
    ]);
  }
  if (typeof response.answer !== 'string' || response.answer.trim().length === 0) {
    throw new EscalationError('response-invalid', 'expert response answer must be a non-blank string', [
      field('answer', 'must be a non-blank string'),
    ]);
  }
  if (!isOneOf(response.confidence, CONFIDENCE_LEVELS)) {
    throw new EscalationError('response-invalid', 'expert response confidence must be low, medium or high', [
      field('confidence', `must be one of ${CONFIDENCE_LEVELS.join(', ')}`),
    ]);
  }
  validateAnswerProvenance(response);
}

function validateAnswerProvenance(response: ExpertResponse): void {
  const answeredBy = response.answeredBy;
  if (!isRecord(answeredBy)) {
    throw provenanceIncomplete('answeredBy', 'the expert profile is missing');
  }
  if (!Array.isArray(answeredBy.expertise) || answeredBy.expertise.length === 0 || !answeredBy.expertise.every(isNonEmptyString)) {
    throw provenanceIncomplete('answeredBy.expertise', 'must be a non-empty array of non-empty tags');
  }
  const provenance = answeredBy.provenance;
  if (!isRecord(provenance) || !isNonEmptyString(provenance.providerId) || !isNonEmptyString(provenance.expertKey)) {
    throw provenanceIncomplete('answeredBy.provenance', 'must carry a non-empty providerId and expertKey');
  }
  const answeredVia = response.answeredVia;
  if (
    !isRecord(answeredVia) ||
    !isNonEmptyString(answeredVia.providerId) ||
    !isNonEmptyString(answeredVia.channel) ||
    !isNonEmptyString(answeredVia.answeredAt)
  ) {
    throw provenanceIncomplete('answeredVia', 'must carry a non-empty providerId, channel and answeredAt');
  }
}

function provenanceIncomplete(fieldName: string, message: string): EscalationError {
  return new EscalationError(
    'provenance-incomplete',
    `expert response provenance is incomplete: ${fieldName} — ${message}`,
    [field(fieldName, message)],
  );
}
