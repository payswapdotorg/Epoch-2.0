/**
 * W024 — Agent Tools: the read-only `AgentToolsOverview` projection. It is a
 * projection only — it never mutates sessions, revisions or the audit log.
 */
import type { AgentCommandOutcome } from "./audit.js";
import type { AgentCommandKind, AgentScope } from "./kinds.js";

export interface AgentSessionSummary {
  readonly sessionId: string;
  readonly commandCount: number;
  readonly openSolutionId: string | null;
  readonly lastCommandDigest: string | null;
}

export interface AgentAuditSummary {
  readonly recordCount: number;
  readonly outcomeCounts: Readonly<Record<AgentCommandOutcome, number>>;
}

export interface AgentToolsOverview {
  readonly availableCommandKinds: readonly AgentCommandKind[];
  readonly requiredScopesByKind: Readonly<
    Record<AgentCommandKind, readonly AgentScope[]>
  >;
  readonly sessionCount: number;
  readonly sessions: readonly AgentSessionSummary[];
  readonly audit: AgentAuditSummary;
}
