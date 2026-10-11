/**
 * W024 — Agent Tools: the dispatcher.
 *
 * Pure and deterministic: command in → authorization check → port call out.
 * It depends ONLY on the Solution Surface port slice, the W007 interaction
 * command surface slice and the W021 WorldStore audit slice. It never imports
 * a renderer implementation and never touches presentation state. Illegal or
 * unauthorized commands raise typed errors — never silent corrections.
 *
 * Idempotency: commands are content-addressed by
 * `sha256(canonicalJson(command))`; a recorded digest fixes the outcome in
 * the append-only audit log and replays on re-dispatch.
 *
 * This module hosts the orchestration only: command execution lives in
 * `./command-executor.js`, session bookkeeping in `./session-state.js`, and
 * restore-by-digest in `./session-restore.js`.
 */
import { AGENT_COMMAND_KINDS, REQUIRED_SCOPES_BY_KIND, isAgentCommandKind } from './kinds.js';
import type { AgentCommandKind } from './kinds.js';
import { validateAgentCommand } from './commands.js';
import type { AgentCommand, AgentCommandOf } from './contract.js';
import { evaluateAuthorization } from './authorization.js';
import type { AgentAuthorization } from './authorization.js';
import {
  AuditDigestCollisionError,
  AuditOutcomeConflictError,
  AuthorizationError,
  IllegalCommandError,
  SessionAlreadyExistsError,
  SessionNotFoundError,
  UnknownCommandKindError,
} from './errors.js';
import type {
  AgentInteractionPort,
  AgentSolutionSurfacePort,
  AgentWorldStorePort,
} from './ports.js';
import type { AgentCommandResult, AgentCommandValueMap } from './results.js';
import type { AgentCommandAuditRecord, AgentCommandOutcome } from './audit.js';
import type { AgentSessionDescriptor, AgentSessionRestoreSource } from './session.js';
import type { AgentToolsOverview } from './overview.js';
import { canonicalJson, sha256Hex } from './hash.js';
import type { AgentSolutionInfo } from './values.js';
import {
  assertOpenSolution,
  createSessionState,
  noteDispatch,
  toDescriptor,
} from './session-state.js';
import type { AgentSessionState } from './session-state.js';
import { normalizeAuditRefs, rebuildSessionFromRecords } from './session-restore.js';
import { executeAgentCommand } from './command-executor.js';

export interface AgentToolDispatcherOptions {
  readonly surface: AgentSolutionSurfacePort;
  readonly interaction: AgentInteractionPort;
  readonly worldStore: AgentWorldStorePort;
}

export class AgentToolDispatcher {
  private readonly surface: AgentSolutionSurfacePort;
  private readonly interaction: AgentInteractionPort;
  private readonly worldStore: AgentWorldStorePort;
  private readonly sessions: Map<string, AgentSessionState>;

  constructor(options: AgentToolDispatcherOptions) {
    if (options === null || typeof options !== 'object') {
      throw new TypeError(
        'AgentToolDispatcher requires an options object with surface, interaction and worldStore',
      );
    }
    const candidate = options as Partial<AgentToolDispatcherOptions>;
    if (!isPort(candidate.surface, ['openSolution', 'inspectSolution', 'simulateSolution'])) {
      throw new TypeError(
        'options.surface must implement the AgentSolutionSurfacePort slice (openSolution, inspectSolution, simulateSolution)',
      );
    }
    if (
      !isPort(candidate.interaction, [
        'applySelection',
        'applyNavigation',
        'applyIsolation',
        'measure',
        'applyAnnotation',
        'getInteractionState',
      ])
    ) {
      throw new TypeError(
        'options.interaction must implement the AgentInteractionPort slice (applySelection, applyNavigation, applyIsolation, measure, applyAnnotation, getInteractionState)',
      );
    }
    if (
      !isPort(candidate.worldStore, [
        'appendCommandRecord',
        'getCommandRecord',
        'listCommandRecords',
      ])
    ) {
      throw new TypeError(
        'options.worldStore must implement the AgentWorldStorePort slice (appendCommandRecord, getCommandRecord, listCommandRecords)',
      );
    }
    this.surface = candidate.surface as AgentSolutionSurfacePort;
    this.interaction = candidate.interaction as AgentInteractionPort;
    this.worldStore = candidate.worldStore as AgentWorldStorePort;
    this.sessions = new Map();
  }

  /** Attaches a new session with caller-supplied identity (deterministic: no RNG). */
  createSession(sessionId: string): AgentSessionDescriptor {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new IllegalCommandError(['sessionId must be a non-empty string']);
    }
    if (this.sessions.has(sessionId)) {
      throw new SessionAlreadyExistsError(sessionId);
    }
    const state = createSessionState(sessionId);
    this.sessions.set(sessionId, state);
    return toDescriptor(state);
  }

  /** Returns a defensive copy of the session descriptor. */
  getSession(sessionId: string): AgentSessionDescriptor {
    return toDescriptor(this.requireSession(sessionId));
  }

  /**
   * Dispatches a command after validating it and checking the authorization
   * law (kind + required scopes + optional session binding) against the
   * caller-supplied `AgentAuthorization`. Unauthorized/illegal commands throw
   * typed errors; successful commands return typed value payloads.
   */
  async dispatch<K extends AgentCommandKind>(
    command: AgentCommandOf<K>,
    authorization: AgentAuthorization,
  ): Promise<AgentCommandResult<K>> {
    // 1. Shape validation — illegal commands are typed errors, never silent corrections.
    const validation = validateAgentCommand(command);
    if (!validation.ok) {
      if (isAgentCommandKind(validation.kind)) {
        throw new IllegalCommandError(validation.issues);
      }
      throw new UnknownCommandKindError(
        typeof validation.kind === 'string' ? validation.kind : String(validation.kind),
      );
    }
    const kind = validation.kind;
    const cmd = command as AgentCommand;
    const canonicalCommand = canonicalJson(command);
    const digest = sha256Hex(canonicalCommand);

    // 2. Authorization law — the caller proves what it may do; default deny.
    const denial = evaluateAuthorization(cmd, authorization);

    // 3. Session attachment is only probed for authorized callers, so denials
    //    cannot be used to enumerate session ids.
    const session = this.sessions.get(cmd.sessionId);
    if (denial === null && session === undefined) {
      throw new SessionNotFoundError(cmd.sessionId);
    }

    // 4. Replay: the audit log is content-addressed; a recorded digest fixes the outcome.
    const existing = await this.worldStore.getCommandRecord(digest);
    if (existing !== undefined) {
      if (existing.command !== canonicalCommand) {
        throw new AuditDigestCollisionError(digest);
      }
      if (denial !== null) {
        throw new AuthorizationError(denial);
      }
      if (existing.outcome === 'denied') {
        throw new AuditOutcomeConflictError(digest, existing.outcome);
      }
      const replayedValue = JSON.parse(existing.result ?? 'null') as AgentCommandValueMap[K];
      noteDispatch(session, digest, 'succeeded', false);
      return {
        status: 'replayed',
        kind: kind as K,
        sessionId: cmd.sessionId,
        commandDigest: digest,
        value: replayedValue,
      };
    }

    // 5. Persist the denial, then throw the typed AuthorizationError.
    if (denial !== null) {
      const deniedRecord: AgentCommandAuditRecord = {
        digest,
        kind,
        sessionId: cmd.sessionId,
        agentId: cmd.provenance.agentId,
        command: canonicalCommand,
        outcome: 'denied',
        errorCode: 'authorization-denied',
        deniedReason: denial.deniedReason,
      };
      await this.worldStore.appendCommandRecord(deniedRecord);
      noteDispatch(session, digest, 'denied', true);
      throw new AuthorizationError(denial);
    }

    // Defensive: unreachable — authorized commands always have an attached session (step 3).
    if (session === undefined) {
      throw new SessionNotFoundError(cmd.sessionId);
    }

    // 6. Preconditions are typed errors too.
    assertOpenSolution(kind, session);

    // 7. Execute through the ports (Solution Surface + interaction commands only).
    const value = await executeAgentCommand(cmd, {
      surface: this.surface,
      interaction: this.interaction,
      openSolution: session.openSolution,
    });

    // 8. Persist the command record through the WorldStore port, then update the session.
    const succeededRecord: AgentCommandAuditRecord = {
      digest,
      kind,
      sessionId: cmd.sessionId,
      agentId: cmd.provenance.agentId,
      command: canonicalCommand,
      outcome: 'succeeded',
      result: canonicalJson(value),
    };
    await this.worldStore.appendCommandRecord(succeededRecord);
    noteDispatch(session, digest, 'succeeded', true);
    if (kind === 'solution.open') {
      session.openSolution = (value as { solution: AgentSolutionInfo }).solution;
    }

    return {
      status: 'executed',
      kind: kind as K,
      sessionId: cmd.sessionId,
      commandDigest: digest,
      value: value as AgentCommandValueMap[K],
    };
  }

  /**
   * Re-attaches a session by digest: every referenced audit record must exist
   * in the world store and belong to the session. Tallies and the open
   * solution are rebuilt from the records.
   */
  async restoreSession(source: AgentSessionRestoreSource): Promise<AgentSessionDescriptor> {
    if (source === null || typeof source !== 'object') {
      throw new IllegalCommandError(['restore source must be a plain object']);
    }
    const sessionId = source.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new IllegalCommandError(['restore source must carry a non-empty sessionId']);
    }
    if (this.sessions.has(sessionId)) {
      throw new SessionAlreadyExistsError(sessionId);
    }
    const auditRefs = normalizeAuditRefs(source);
    const rebuilt = await rebuildSessionFromRecords(sessionId, auditRefs, this.worldStore);
    const state = createSessionState(sessionId);
    for (const digest of auditRefs) {
      state.auditRefs.push(digest);
    }
    state.openSolution = rebuilt.openSolution;
    state.outcomeCounts.succeeded = rebuilt.outcomeCounts.succeeded;
    state.outcomeCounts.denied = rebuilt.outcomeCounts.denied;
    state.lastCommandDigest = auditRefs.length > 0 ? auditRefs[auditRefs.length - 1] : null;
    this.sessions.set(sessionId, state);
    return toDescriptor(state);
  }

  /** Read-only projection: available command kinds, session summaries, audit summary. */
  async overview(): Promise<AgentToolsOverview> {
    const records = await this.worldStore.listCommandRecords();
    const outcomeCounts: Record<AgentCommandOutcome, number> = { succeeded: 0, denied: 0 };
    for (const record of records) {
      if (record.outcome === 'succeeded' || record.outcome === 'denied') {
        outcomeCounts[record.outcome] += 1;
      }
    }
    const sessions = [...this.sessions.values()]
      .map((state) => ({
        sessionId: state.sessionId,
        commandCount: state.auditRefs.length,
        openSolutionId: state.openSolution === null ? null : state.openSolution.solutionId,
        lastCommandDigest: state.lastCommandDigest,
      }))
      .sort((left, right) =>
        left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0,
      );
    return {
      availableCommandKinds: [...AGENT_COMMAND_KINDS],
      requiredScopesByKind: REQUIRED_SCOPES_BY_KIND,
      sessionCount: sessions.length,
      sessions,
      audit: { recordCount: records.length, outcomeCounts },
    };
  }

  private requireSession(sessionId: string): AgentSessionState {
    const state = this.sessions.get(sessionId);
    if (state === undefined) {
      throw new SessionNotFoundError(sessionId);
    }
    return state;
  }
}

function isPort(candidate: unknown, methodNames: readonly string[]): boolean {
  if (candidate === null || typeof candidate !== 'object') {
    return false;
  }
  return methodNames.every(
    (name) => typeof (candidate as Record<string, unknown>)[name] === 'function',
  );
}
