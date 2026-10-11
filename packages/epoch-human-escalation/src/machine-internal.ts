import type { EscalatedRequestRecord, EscalationState, ExpertiseTag, RequestId } from './contracts.js';
import type { EscalationErrorDetail } from './errors.js';
import { stateDigest } from './serialize.js';

/**
 * Internal helpers shared by the split machine modules
 * (machine-policy / machine-rate / machine-requests / machine-steps).
 * Deliberately NOT re-exported through the machine barrel: the public
 * surface stays exactly DEFAULT_ESCALATION_POLICY, confidenceRank, init,
 * request, resolve, expire, sweepExpiries, advanceStep, historyOf,
 * openRequests, EscalationMachine.
 */

export function field(name: string, message: string): EscalationErrorDetail {
  return { field: name, message };
}

export function lookup(state: EscalationState, requestId: RequestId): EscalatedRequestRecord | undefined {
  return (state.requests as Record<RequestId, EscalatedRequestRecord | undefined>)[requestId];
}

export function withRecord(state: EscalationState, requestId: RequestId, record: EscalatedRequestRecord): EscalationState {
  return {
    ...state,
    parentDigest: stateDigest(state),
    requests: { ...state.requests, [requestId]: record },
  };
}

export function bumpRejections(state: EscalationState, requestId: RequestId): EscalationState {
  const record = lookup(state, requestId);
  if (record === undefined) {
    return state;
  }
  return withRecord(state, requestId, { ...record, rejectionCount: record.rejectionCount + 1 });
}

export function hasOverlap(requested: readonly ExpertiseTag[], provided: readonly ExpertiseTag[]): boolean {
  const providedSet = new Set<ExpertiseTag>(provided);
  return requested.some((tag) => providedSet.has(tag));
}
