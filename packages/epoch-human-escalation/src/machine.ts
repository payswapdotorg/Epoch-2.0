import {
  CONFIDENCE_LEVELS,
  ESCALATION_QUESTION_KINDS,
  type ConfidenceLevel,
  type EscalatedRequestRecord,
  type EscalationHistoryEntry,
  type EscalationOutcome,
  type EscalationPolicy,
  type EscalationQuestion,
  type EscalationQuestionKind,
  type EscalationRequest,
  type EscalationState,
  type ExpertResponse,
  type ExpertiseTag,
  type RequestId,
} from './contracts.js';
import { EscalationError, type EscalationErrorDetail } from './errors.js';
import { digestOf, stateDigest } from './serialize.js';
import { isNonEmptyString, isNonNegativeInteger, isOneOf, isRecord } from './guards.js';

/**
 * The escalation machine: pure and deterministic.
 *
 * Determinism law: identical request/response sequences produce byte-identical
 * serializations and digests. The machine never reads the wall clock, never
 * samples randomness, and keeps only monotonic counters (`step`, `serial`,
 * per-request `rejectionCount`) plus data supplied by its callers.
 *
 * No-second-authority law: the machine holds no world reference and exposes no
 * world mutation. Expert responses enter as provenance-bearing input and are
 * stored only inside escalation records.
 */

const CONFIDENCE_RANK: Readonly<Record<ConfidenceLevel, number>> = { low: 0, medium: 1, high: 2 };

export const DEFAULT_ESCALATION_POLICY: EscalationPolicy = {
  allowedQuestionKinds: ['factual', 'interpretive', 'procedural', 'advisory'] as readonly EscalationQuestionKind[],
  minEvidenceRefs: 1,
  minContextSnapshots: 0,
  minRequestedExpertiseTags: 1,
  minQuestionBodyChars: 1,
  maxQuestionBodyChars: 2000,
  minConfidence: 'low',
  requireExpertiseOverlap: false,
  expirySteps: 0,
  rateLimits: { maxOpenRequests: 4, maxNewRequestsPerStep: 2 },
};

export function confidenceRank(level: ConfidenceLevel): number {
  return CONFIDENCE_RANK[level];
}

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
  const open = openRequests(state);
  if (open.length >= state.policy.rateLimits.maxOpenRequests) {
    throw new EscalationError(
      'rate-limit-exceeded',
      `${open.length} open request(s) already meet rateLimits.maxOpenRequests=${state.policy.rateLimits.maxOpenRequests}`,
      [field('rateLimits.maxOpenRequests', 'open request budget exhausted')],
    );
  }
  const openedThisStep = open.filter((record) => record.request.openedAtStep === state.step).length;
  if (openedThisStep >= state.policy.rateLimits.maxNewRequestsPerStep) {
    throw new EscalationError(
      'rate-limit-exceeded',
      `${openedThisStep} request(s) already opened at step ${state.step}; rateLimits.maxNewRequestsPerStep=${state.policy.rateLimits.maxNewRequestsPerStep}`,
      [field('rateLimits.maxNewRequestsPerStep', 'per-step request budget exhausted')],
    );
  }
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

/** expire(state, requestId) → state + outcome ('expired', or rejected for unknown/closed requests). */
export function expire(
  state: EscalationState,
  requestId: RequestId,
): { state: EscalationState; outcome: EscalationOutcome } {
  const record = lookup(state, requestId);
  if (record === undefined) {
    return { state, outcome: { kind: 'rejected', requestId, reason: 'unknown-request' } };
  }
  if (record.status !== 'open') {
    return { state, outcome: { kind: 'rejected', requestId, reason: 'request-not-open' } };
  }
  const updated: EscalatedRequestRecord = { ...record, status: 'expired', expiredAtStep: state.step };
  return {
    state: withRecord(state, requestId, updated),
    outcome: { kind: 'expired', requestId, expiredAtStep: state.step },
  };
}

/** Sweeps open requests at least `policy.expirySteps` steps old to 'expired'. 0 = never. */
export function sweepExpiries(state: EscalationState): { state: EscalationState; outcomes: readonly EscalationOutcome[] } {
  const window = state.policy.expirySteps;
  if (window <= 0) {
    return { state, outcomes: [] };
  }
  const outcomes: EscalationOutcome[] = [];
  let next = state;
  for (const record of openRequests(state)) {
    const age = state.step - record.request.openedAtStep;
    if (age < window) {
      continue;
    }
    const result = expire(next, record.request.id);
    next = result.state;
    outcomes.push(result.outcome);
  }
  return { state: next, outcomes };
}

/** Advances the monotonic step counter (host-driven; mirrors external lifecycle progress). */
export function advanceStep(state: EscalationState): EscalationState {
  return { ...state, step: state.step + 1, parentDigest: stateDigest(state) };
}

/** historyOf(state): requests in serial order with status, accepted response and rejection count. */
export function historyOf(state: EscalationState): readonly EscalationHistoryEntry[] {
  return Object.values(state.requests)
    .sort((a, b) => a.request.serial - b.request.serial)
    .map((record): EscalationHistoryEntry => ({
      request: record.request,
      status: record.status,
      acceptedResponse: record.acceptedResponse,
      rejectionCount: record.rejectionCount,
    }));
}

/** Open request records (insertion order, which equals serial order by construction). */
export function openRequests(state: EscalationState): readonly EscalatedRequestRecord[] {
  return Object.values(state.requests).filter((record) => record.status === 'open');
}

/** The escalation machine as a single frozen facade (pure, deterministic). */
export const EscalationMachine: Readonly<{
  init: typeof init;
  request: typeof request;
  resolve: typeof resolve;
  expire: typeof expire;
  sweepExpiries: typeof sweepExpiries;
  advanceStep: typeof advanceStep;
  historyOf: typeof historyOf;
  openRequests: typeof openRequests;
}> = Object.freeze({ init, request, resolve, expire, sweepExpiries, advanceStep, historyOf, openRequests });

// --- internals -------------------------------------------------------------

function lookup(state: EscalationState, requestId: RequestId): EscalatedRequestRecord | undefined {
  return (state.requests as Record<RequestId, EscalatedRequestRecord | undefined>)[requestId];
}

function withRecord(state: EscalationState, requestId: RequestId, record: EscalatedRequestRecord): EscalationState {
  return {
    ...state,
    parentDigest: stateDigest(state),
    requests: { ...state.requests, [requestId]: record },
  };
}

function bumpRejections(state: EscalationState, requestId: RequestId): EscalationState {
  const record = lookup(state, requestId);
  if (record === undefined) {
    return state;
  }
  return withRecord(state, requestId, { ...record, rejectionCount: record.rejectionCount + 1 });
}

function hasOverlap(requested: readonly ExpertiseTag[], provided: readonly ExpertiseTag[]): boolean {
  const providedSet = new Set<ExpertiseTag>(provided);
  return requested.some((tag) => providedSet.has(tag));
}

function field(name: string, message: string): EscalationErrorDetail {
  return { field: name, message };
}

function validatePolicy(policy: EscalationPolicy): void {
  const details: EscalationErrorDetail[] = [];
  if (!Array.isArray(policy.allowedQuestionKinds) || policy.allowedQuestionKinds.length === 0) {
    details.push(field('allowedQuestionKinds', 'must be a non-empty array of question kinds'));
  } else {
    for (const kind of policy.allowedQuestionKinds) {
      if (!isOneOf(kind, ESCALATION_QUESTION_KINDS)) {
        details.push(field('allowedQuestionKinds', `unknown question kind "${String(kind)}"`));
      }
    }
  }
  if (!isNonNegativeInteger(policy.minEvidenceRefs)) {
    details.push(field('minEvidenceRefs', 'must be a non-negative integer'));
  }
  if (!isNonNegativeInteger(policy.minContextSnapshots)) {
    details.push(field('minContextSnapshots', 'must be a non-negative integer'));
  }
  if (!isNonNegativeInteger(policy.minRequestedExpertiseTags)) {
    details.push(field('minRequestedExpertiseTags', 'must be a non-negative integer'));
  }
  if (!isNonNegativeInteger(policy.minQuestionBodyChars)) {
    details.push(field('minQuestionBodyChars', 'must be a non-negative integer'));
  }
  if (!isNonNegativeInteger(policy.maxQuestionBodyChars) || policy.maxQuestionBodyChars < 1) {
    details.push(field('maxQuestionBodyChars', 'must be an integer >= 1'));
  }
  if (
    isNonNegativeInteger(policy.minQuestionBodyChars) &&
    isNonNegativeInteger(policy.maxQuestionBodyChars) &&
    policy.minQuestionBodyChars > policy.maxQuestionBodyChars
  ) {
    details.push(field('minQuestionBodyChars', 'must not exceed maxQuestionBodyChars'));
  }
  if (!isOneOf(policy.minConfidence, CONFIDENCE_LEVELS)) {
    details.push(field('minConfidence', `must be one of ${CONFIDENCE_LEVELS.join(', ')}`));
  }
  if (typeof policy.requireExpertiseOverlap !== 'boolean') {
    details.push(field('requireExpertiseOverlap', 'must be a boolean'));
  }
  if (!isNonNegativeInteger(policy.expirySteps)) {
    details.push(field('expirySteps', 'must be a non-negative integer (0 = never)'));
  }
  if (!isRecord(policy.rateLimits)) {
    details.push(field('rateLimits', 'must be an object'));
  } else {
    if (!isNonNegativeInteger(policy.rateLimits.maxOpenRequests)) {
      details.push(field('rateLimits.maxOpenRequests', 'must be a non-negative integer'));
    }
    if (!isNonNegativeInteger(policy.rateLimits.maxNewRequestsPerStep)) {
      details.push(field('rateLimits.maxNewRequestsPerStep', 'must be a non-negative integer'));
    }
  }
  if (details.length > 0) {
    throw new EscalationError('policy-invalid', 'escalation policy failed validation', details);
  }
}

function validateQuestion(policy: EscalationPolicy, question: EscalationQuestion): void {
  if (!isRecord(question)) {
    throw new EscalationError('question-invalid', 'escalation question must be an object', [
      field('question', 'not an object'),
    ]);
  }
  if (
    !isOneOf(question.kind, ESCALATION_QUESTION_KINDS) ||
    !(policy.allowedQuestionKinds as readonly string[]).includes(question.kind)
  ) {
    throw new EscalationError(
      'question-kind-not-allowed',
      `question kind "${String(question.kind)}" is not allowed by this escalation policy`,
      [field('allowedQuestionKinds', `allowed kinds: ${policy.allowedQuestionKinds.join(', ')}`)],
    );
  }
  const details: EscalationErrorDetail[] = [];
  if (typeof question.body !== 'string') {
    details.push(field('body', 'must be a string'));
  } else {
    const length = question.body.trim().length;
    if (length < policy.minQuestionBodyChars) {
      details.push(field('body', `trimmed length ${length} is below minQuestionBodyChars=${policy.minQuestionBodyChars}`));
    }
    if (length > policy.maxQuestionBodyChars) {
      details.push(field('body', `trimmed length ${length} exceeds maxQuestionBodyChars=${policy.maxQuestionBodyChars}`));
    }
  }
  collectRefDetails(question.evidence, 'evidence', policy.minEvidenceRefs, details);
  collectRefDetails(question.contextSnapshots, 'contextSnapshots', policy.minContextSnapshots, details);
  if (!Array.isArray(question.requestedExpertise)) {
    details.push(field('requestedExpertise', 'must be an array of expertise tags'));
  } else {
    if (question.requestedExpertise.length < policy.minRequestedExpertiseTags) {
      details.push(
        field(
          'requestedExpertise',
          `${question.requestedExpertise.length} tag(s) is below minRequestedExpertiseTags=${policy.minRequestedExpertiseTags}`,
        ),
      );
    }
    question.requestedExpertise.forEach((tag, index) => {
      if (!isNonEmptyString(tag)) {
        details.push(field(`requestedExpertise[${index}]`, 'must be a non-empty tag'));
      }
    });
  }
  if (details.length > 0) {
    throw new EscalationError('question-invalid', 'escalation question failed policy validation', details);
  }
}

function collectRefDetails(refs: unknown, name: string, minimum: number, details: EscalationErrorDetail[]): void {
  if (!Array.isArray(refs)) {
    details.push(field(name, 'must be an array of digest refs'));
    return;
  }
  if (refs.length < minimum) {
    details.push(field(name, `${refs.length} ref(s) is below ${name} minimum=${minimum}`));
  }
  refs.forEach((ref, index) => {
    if (!isRecord(ref) || !isNonEmptyString(ref.digest)) {
      details.push(field(`${name}[${index}]`, 'must carry a non-empty digest'));
    }
  });
}

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
