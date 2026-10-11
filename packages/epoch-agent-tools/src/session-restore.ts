/**
 * W024 — Agent Tools: session restore-by-digest.
 *
 * Helpers backing `AgentToolDispatcher.restoreSession`: audit-ref
 * normalization (validation + order-preserving dedup) and the rebuild of a
 * session's tallies/open solution from the WorldStore's append-only command
 * records. Extracted from `./dispatcher.js` to keep every module under the
 * architecture line budget; behavior (including error order) is unchanged.
 */
import { isAgentCommandAuditRecord } from './audit.js';
import type { AgentWorldStorePort } from './ports.js';
import type { AgentSessionRestoreSource } from './session.js';
import type { AgentSolutionInfo } from './values.js';
import {
  AuditRecordMismatchError,
  AuditRecordMissingError,
  IllegalCommandError,
} from './errors.js';

/** Tallies rebuilt from audit records for a restored session. */
export interface RebuiltSessionTallies {
  readonly openSolution: AgentSolutionInfo | null;
  readonly outcomeCounts: { readonly succeeded: number; readonly denied: number };
}

/** Validates and de-duplicates (order-preserving) the restore source's audit refs. */
export function normalizeAuditRefs(source: AgentSessionRestoreSource): string[] {
  const refsSource = (source as { auditRefs?: unknown }).auditRefs;
  if (refsSource !== undefined && !Array.isArray(refsSource)) {
    throw new IllegalCommandError(['restore source auditRefs must be an array of digests when present']);
  }
  const auditRefs: string[] = [];
  const seen = new Set<string>();
  for (const entry of (refsSource ?? []) as unknown[]) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new IllegalCommandError(['restore source auditRefs must contain non-empty digest strings']);
    }
    if (!seen.has(entry)) {
      seen.add(entry);
      auditRefs.push(entry);
    }
  }
  return auditRefs;
}

/** Replays every referenced record through the WorldStore port, rebuilding the session. */
export async function rebuildSessionFromRecords(
  sessionId: string,
  auditRefs: readonly string[],
  worldStore: AgentWorldStorePort,
): Promise<RebuiltSessionTallies> {
  const outcomeCounts = { succeeded: 0, denied: 0 };
  let openSolution: AgentSolutionInfo | null = null;
  for (const digest of auditRefs) {
    const record = await worldStore.getCommandRecord(digest);
    if (record === undefined) {
      throw new AuditRecordMissingError(sessionId, digest);
    }
    if (!isAgentCommandAuditRecord(record)) {
      throw new AuditRecordMismatchError(sessionId, digest, 'stored record is malformed');
    }
    if (record.sessionId !== sessionId) {
      throw new AuditRecordMismatchError(
        sessionId,
        digest,
        `record belongs to session "${record.sessionId}"`,
      );
    }
    if (record.outcome === 'succeeded') {
      outcomeCounts.succeeded += 1;
      if (record.kind === 'solution.open' && record.result !== undefined) {
        const parsed = JSON.parse(record.result) as { solution?: AgentSolutionInfo };
        if (
          parsed.solution === undefined ||
          typeof parsed.solution.solutionId !== 'string' ||
          typeof parsed.solution.revision !== 'string'
        ) {
          throw new AuditRecordMismatchError(
            sessionId,
            digest,
            'solution.open record carries no valid solution payload',
          );
        }
        openSolution = parsed.solution;
      }
    } else {
      outcomeCounts.denied += 1;
    }
  }
  return { openSolution, outcomeCounts };
}
