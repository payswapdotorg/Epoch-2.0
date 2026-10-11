import {
  CONFIDENCE_LEVELS,
  ESCALATION_QUESTION_KINDS,
  type ConfidenceLevel,
  type EscalationPolicy,
  type EscalationQuestion,
  type EscalationQuestionKind,
} from './contracts.js';
import { EscalationError, type EscalationErrorDetail } from './errors.js';
import { isNonEmptyString, isNonNegativeInteger, isOneOf, isRecord } from './guards.js';
import { field } from './machine-internal.js';

/**
 * Policy data and policy/question validation for the escalation machine.
 * `EscalationPolicy` is pure data (thresholds, question kinds, rate limits);
 * an invalid policy or a policy-violating question is a typed error, never
 * silently accepted input.
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

export function validatePolicy(policy: EscalationPolicy): void {
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

export function validateQuestion(policy: EscalationPolicy, question: EscalationQuestion): void {
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
