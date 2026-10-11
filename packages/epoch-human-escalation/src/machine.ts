/**
 * Escalation machine barrel: the split modules (policy / rate / requests /
 * steps) re-exported under the original single public surface, plus the
 * frozen EscalationMachine facade. Pure and deterministic throughout.
 */
import { DEFAULT_ESCALATION_POLICY, confidenceRank } from './machine-policy.js';
import { init, request, resolve } from './machine-requests.js';
import { advanceStep, expire, historyOf, openRequests, sweepExpiries } from './machine-steps.js';

export { DEFAULT_ESCALATION_POLICY, confidenceRank } from './machine-policy.js';
export { init, request, resolve } from './machine-requests.js';
export { advanceStep, expire, historyOf, openRequests, sweepExpiries } from './machine-steps.js';

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
