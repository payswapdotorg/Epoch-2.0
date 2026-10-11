/**
 * W024 — Agent Tools: the session descriptor (session identity + command
 * audit log refs by digest) and the restore source shape.
 */
import type { AgentCommandOutcome } from './audit.js';
import type { AgentSolutionInfo } from './values.js';

export interface AgentSessionDescriptor {
  readonly sessionId: string;
  readonly openSolution: AgentSolutionInfo | null;
  /** Audit log refs by digest, in first-dispatch order. */
  readonly auditRefs: readonly string[];
  readonly commandCount: number;
  readonly lastCommandDigest: string | null;
  readonly outcomeCounts: Readonly<Record<AgentCommandOutcome, number>>;
}

/**
 * A restore source carries a session identity plus its audit refs by digest.
 * A full `AgentSessionDescriptor` satisfies this shape.
 */
export type AgentSessionRestoreSource = Pick<AgentSessionDescriptor, 'sessionId' | 'auditRefs'>;
