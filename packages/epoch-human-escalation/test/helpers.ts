import type {
  AnswerProvenance,
  ConfidenceLevel,
  EscalationPolicy,
  EscalationQuestion,
  EscalationState,
  ExpertProfile,
  ExpertResponse,
  ExpertiseTag,
  RequestId,
} from '../src/index.js';
import { DEFAULT_ESCALATION_POLICY, init, request } from '../src/index.js';
import type { WorldRevisionView } from '../src/index.js';

export function baseQuestion(overrides: Partial<EscalationQuestion> = {}): EscalationQuestion {
  return {
    kind: overrides.kind ?? 'factual',
    body: overrides.body ?? 'Which reconstruction rule applies to wall openings in this fixture?',
    evidence: overrides.evidence ?? [{ digest: 'a'.repeat(64) }],
    contextSnapshots: overrides.contextSnapshots ?? [{ digest: 'b'.repeat(64) }],
    requestedExpertise: overrides.requestedExpertise ?? ['ifc', 'construction'],
  };
}

export function openPolicy(overrides: Partial<EscalationPolicy> = {}): EscalationPolicy {
  return {
    allowedQuestionKinds: overrides.allowedQuestionKinds ?? DEFAULT_ESCALATION_POLICY.allowedQuestionKinds,
    minEvidenceRefs: overrides.minEvidenceRefs ?? DEFAULT_ESCALATION_POLICY.minEvidenceRefs,
    minContextSnapshots: overrides.minContextSnapshots ?? DEFAULT_ESCALATION_POLICY.minContextSnapshots,
    minRequestedExpertiseTags: overrides.minRequestedExpertiseTags ?? DEFAULT_ESCALATION_POLICY.minRequestedExpertiseTags,
    minQuestionBodyChars: overrides.minQuestionBodyChars ?? DEFAULT_ESCALATION_POLICY.minQuestionBodyChars,
    maxQuestionBodyChars: overrides.maxQuestionBodyChars ?? DEFAULT_ESCALATION_POLICY.maxQuestionBodyChars,
    minConfidence: overrides.minConfidence ?? DEFAULT_ESCALATION_POLICY.minConfidence,
    requireExpertiseOverlap: overrides.requireExpertiseOverlap ?? DEFAULT_ESCALATION_POLICY.requireExpertiseOverlap,
    expirySteps: overrides.expirySteps ?? DEFAULT_ESCALATION_POLICY.expirySteps,
    rateLimits: overrides.rateLimits ?? DEFAULT_ESCALATION_POLICY.rateLimits,
  };
}

export function fullResponse(requestId: string, overrides: Partial<ExpertResponse> = {}): ExpertResponse {
  const answeredBy: ExpertProfile =
    overrides.answeredBy ?? {
      expertise: ['ifc', 'construction'],
      provenance: {
        providerId: 'test-provider',
        expertKey: 'expert-7',
        declaredExpertise: ['ifc', 'construction'],
      },
    };
  const answeredVia: AnswerProvenance =
    overrides.answeredVia ?? {
      providerId: 'test-provider',
      channel: 'direct',
      answeredAt: '2026-07-01T10:00:00.000Z',
    };
  return {
    requestId,
    answer: overrides.answer ?? 'Rule 4.2 applies; see the referenced evidence digest.',
    confidence: overrides.confidence ?? 'high',
    answeredBy,
    answeredVia,
  };
}

export interface MutableResponse {
  requestId: string;
  answer: string;
  confidence: ConfidenceLevel;
  answeredBy: {
    expertise: ExpertiseTag[];
    provenance: { providerId: string; expertKey: string; declaredExpertise?: ExpertiseTag[] };
  };
  answeredVia: { providerId: string; channel: string; answeredAt: string };
}

/** Removes a top-level field to forge structurally incomplete responses. */
export function missing(response: ExpertResponse, key: 'answeredBy' | 'answeredVia'): ExpertResponse {
  const copy: Record<string, unknown> = { ...(response as unknown as Record<string, unknown>) };
  delete copy[key];
  return copy as unknown as ExpertResponse;
}

/** Blanks a provenance field to forge incomplete provenance at runtime. */
export function blanked(
  response: ExpertResponse,
  target: 'providerId' | 'expertKey' | 'answeredAt' | 'channel' | 'answer',
): ExpertResponse {
  const copy = JSON.parse(JSON.stringify(response)) as MutableResponse;
  switch (target) {
    case 'providerId':
      copy.answeredBy.provenance.providerId = '';
      copy.answeredVia.providerId = '';
      break;
    case 'expertKey':
      copy.answeredBy.provenance.expertKey = '';
      break;
    case 'answeredAt':
      copy.answeredVia.answeredAt = '';
      break;
    case 'channel':
      copy.answeredVia.channel = '';
      break;
    case 'answer':
      copy.answer = '   ';
      break;
  }
  return copy as unknown as ExpertResponse;
}

export function openRequest(policy: EscalationPolicy = openPolicy()): { state: EscalationState; id: RequestId } {
  const result = request(init(policy), baseQuestion());
  return { state: result.state, id: result.request.id };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** A world-revision view that records every mutation attempt (none are expected). */
export function recordingWorld(revisionDigest = 'c'.repeat(64)): { world: WorldRevisionView; writes: string[] } {
  const writes: string[] = [];
  const target: Record<string, unknown> = { revisionDigest };
  const world = new Proxy(target, {
    get(t, property) {
      return t[property as string];
    },
    set(_t, property) {
      writes.push(`set:${String(property)}`);
      return false;
    },
    deleteProperty(_t, property) {
      writes.push(`delete:${String(property)}`);
      return false;
    },
    defineProperty(_t, property) {
      writes.push(`define:${String(property)}`);
      return false;
    },
  }) as unknown as WorldRevisionView;
  return { world, writes };
}
