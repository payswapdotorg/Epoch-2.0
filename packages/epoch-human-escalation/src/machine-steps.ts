import type {
  EscalatedRequestRecord,
  EscalationHistoryEntry,
  EscalationOutcome,
  EscalationState,
  RequestId,
} from './contracts.js';
import { lookup, withRecord } from './machine-internal.js';
import { stateDigest } from './serialize.js';

/**
 * Step/expire/history logic for the escalation machine: `expire`,
 * `sweepExpiries`, `advanceStep`, `historyOf`, `openRequests`.
 * Pure and deterministic; the monotonic `step` counter is host-driven and
 * mirrors external lifecycle progress — never the wall clock.
 */

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
