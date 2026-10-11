/**
 * W024 — Agent Tools: session bookkeeping for the dispatcher.
 *
 * `AgentSessionState` is the dispatcher-internal mutable tally per session;
 * `toDescriptor` projects it into the public, defensive
 * `AgentSessionDescriptor`. Extracted from `./dispatcher.js` to keep every
 * module under the architecture line budget; behavior is unchanged.
 */
import type { AgentCommandOutcome } from './audit.js';
import type { AgentCommandKind } from './kinds.js';
import type { AgentSessionDescriptor } from './session.js';
import type { AgentSolutionInfo } from './values.js';
import { IllegalCommandError } from './errors.js';

export interface AgentSessionState {
  readonly sessionId: string;
  readonly auditRefs: string[];
  openSolution: AgentSolutionInfo | null;
  lastCommandDigest: string | null;
  readonly outcomeCounts: { succeeded: number; denied: number };
}

/** Creates the empty state for a freshly attached session (no RNG, no clocks). */
export function createSessionState(sessionId: string): AgentSessionState {
  return {
    sessionId,
    auditRefs: [],
    openSolution: null,
    lastCommandDigest: null,
    outcomeCounts: { succeeded: 0, denied: 0 },
  };
}

/** Projects internal state into a defensive public descriptor copy. */
export function toDescriptor(state: AgentSessionState): AgentSessionDescriptor {
  return {
    sessionId: state.sessionId,
    openSolution: state.openSolution === null ? null : { ...state.openSolution },
    auditRefs: [...state.auditRefs],
    commandCount: state.auditRefs.length,
    lastCommandDigest: state.lastCommandDigest,
    outcomeCounts: { succeeded: state.outcomeCounts.succeeded, denied: state.outcomeCounts.denied },
  };
}

/** Commands other than solution.open require an open solution (typed error). */
export function assertOpenSolution(kind: AgentCommandKind, session: AgentSessionState): void {
  if (kind === 'solution.open') {
    return;
  }
  if (session.openSolution === null) {
    throw new IllegalCommandError([
      `command kind "${kind}" requires an open solution; dispatch solution.open for session "${session.sessionId}" first`,
    ]);
  }
}

/** Records a dispatch in the session tally (replays update ordering only). */
export function noteDispatch(
  session: AgentSessionState | undefined,
  digest: string,
  outcome: AgentCommandOutcome,
  countRecord: boolean,
): void {
  if (session === undefined) {
    return;
  }
  if (!session.auditRefs.includes(digest)) {
    session.auditRefs.push(digest);
  }
  session.lastCommandDigest = digest;
  if (countRecord) {
    session.outcomeCounts[outcome] += 1;
  }
}
