import type {
  ConfidenceLevel,
  EscalationRequest,
  ExpertProfile,
  ExpertResponse,
  ExpertiseTag,
  RequestId,
} from './contracts.js';

/**
 * The adapter boundary. The port is provider-neutral: concrete providers
 * (human marketplaces, internal expert pools) are OUT of scope for W025 —
 * only this port plus the in-memory test adapter ship.
 *
 * The adapter NEVER becomes an authority: it produces ExpertResponse values
 * (provenance-bearing input). The escalation machine decides acceptance;
 * expert data never becomes world content.
 *
 * The adapter's prototype surface is exactly submit / awaitResponse / fulfill
 * / submittedRequests — response synthesis lives in a module-level function,
 * NOT a class method, so no hidden behavior rides the boundary.
 */

/** Fixed default clock reading so adapter-produced responses are deterministic. */
export const DETERMINISTIC_EPOCH = '1970-01-01T00:00:00.000Z';

export interface AdapterReceipt {
  readonly providerId: string;
  readonly requestId: RequestId;
  readonly channel: string;
  readonly acceptedAt: string;
}

/** Provider-neutral escalation adapter port. */
export interface EscalationAdapter {
  readonly providerId: string;
  readonly channel: string;
  submit(request: EscalationRequest): Promise<AdapterReceipt>;
  awaitResponse(requestId: RequestId): Promise<ExpertResponse | null>;
}

export interface InMemoryEscalationAdapterOptions {
  readonly providerId?: string;
  readonly channel?: string;
  readonly expertKey?: string;
  readonly expertise?: readonly ExpertiseTag[];
  readonly confidence?: ConfidenceLevel;
  readonly answeredAt?: string;
  readonly autoRespond?: boolean;
  readonly answerFor?: (request: EscalationRequest) => string;
}

/** Answer-profile data used to synthesize provenance-bearing responses. */
interface AnswerProfile {
  readonly providerId: string;
  readonly channel: string;
  readonly expertKey: string;
  readonly expertise: readonly ExpertiseTag[];
  readonly confidence: ConfidenceLevel;
  readonly answeredAt: string;
  readonly answerFor: ((request: EscalationRequest) => string) | undefined;
}

/** Module-level response synthesis (deliberately off the class prototype). */
function buildExpertResponse(profile: AnswerProfile, request: EscalationRequest): ExpertResponse {
  const expertise: readonly ExpertiseTag[] = [...profile.expertise];
  const answeredBy: ExpertProfile = {
    expertise,
    provenance: {
      providerId: profile.providerId,
      expertKey: profile.expertKey,
      declaredExpertise: expertise,
    },
  };
  return {
    requestId: request.id,
    answer:
      profile.answerFor !== undefined
        ? profile.answerFor(request)
        : `in-memory expert answer for ${request.id} (${request.question.kind})`,
    confidence: profile.confidence,
    answeredBy,
    answeredVia: { providerId: profile.providerId, channel: profile.channel, answeredAt: profile.answeredAt },
  };
}

/** In-memory test adapter: deterministic by default, scriptable for negative tests. */
export class InMemoryEscalationAdapter implements EscalationAdapter {
  readonly providerId: string;
  readonly channel: string;
  private readonly expertKey: string;
  private readonly expertise: readonly ExpertiseTag[];
  private readonly confidence: ConfidenceLevel;
  private readonly answeredAt: string;
  private readonly autoRespond: boolean;
  private readonly answerFor: ((request: EscalationRequest) => string) | undefined;
  private readonly submitted: EscalationRequest[] = [];
  private readonly fulfilled = new Map<RequestId, ExpertResponse>();

  constructor(options: InMemoryEscalationAdapterOptions = {}) {
    this.providerId = options.providerId ?? 'in-memory';
    this.channel = options.channel ?? 'direct';
    this.expertKey = options.expertKey ?? 'in-memory-expert-1';
    this.expertise = options.expertise ?? ['general'];
    this.confidence = options.confidence ?? 'medium';
    this.answeredAt = options.answeredAt ?? DETERMINISTIC_EPOCH;
    this.autoRespond = options.autoRespond ?? true;
    this.answerFor = options.answerFor;
  }

  submit(request: EscalationRequest): Promise<AdapterReceipt> {
    this.submitted.push(request);
    return Promise.resolve({
      providerId: this.providerId,
      requestId: request.id,
      channel: this.channel,
      acceptedAt: this.answeredAt,
    });
  }

  async awaitResponse(requestId: RequestId): Promise<ExpertResponse | null> {
    const known = this.fulfilled.get(requestId);
    if (known !== undefined) {
      return known;
    }
    if (!this.autoRespond) {
      return null;
    }
    const request = this.submitted.find((candidate) => candidate.id === requestId);
    if (request === undefined) {
      return null;
    }
    const response = buildExpertResponse(
      {
        providerId: this.providerId,
        channel: this.channel,
        expertKey: this.expertKey,
        expertise: this.expertise,
        confidence: this.confidence,
        answeredAt: this.answeredAt,
        answerFor: this.answerFor,
      },
      request,
    );
    this.fulfilled.set(requestId, response);
    return response;
  }

  /** Test hook: inject a (possibly malformed) response for a submitted request. */
  fulfill(requestId: RequestId, response: ExpertResponse): void {
    this.fulfilled.set(requestId, response);
  }

  submittedRequests(): readonly EscalationRequest[] {
    return [...this.submitted];
  }
}
