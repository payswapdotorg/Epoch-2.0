import type { EscalationState } from './contracts.js';
import { EscalationError } from './errors.js';
import { field } from './machine-internal.js';
import { openRequests } from './machine-steps.js';

/**
 * Rate limiting for the escalation machine: the open-request budget and the
 * per-step new-request budget, both expressed as data in
 * `EscalationPolicy.rateLimits`. Violations are typed 'rate-limit-exceeded'
 * errors — never silently accepted requests.
 */
export function enforceRateLimits(state: EscalationState): void {
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
}
