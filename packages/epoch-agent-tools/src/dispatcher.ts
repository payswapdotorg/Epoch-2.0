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
 */
import { AGENT_COMMAND_KINDS, REQUIRED_SCOPES_BY_KIND, isAgentCommandKind } from './kinds.js';
import type { AgentCommandKind } from './kinds.js';
import { validateAgentCommand } from './commands.js';
import type { AgentCommand, AgentCommandOf } from './commands.js';
import { evaluateAuthorization } from './authorization.js';
import type { AgentAuthorization } from './authorization.js';
import {
  AgentPortError,
  AgentToolsError,
  AuditDigestCollisionError,
  AuditOutcomeConflictError,
  AuditRecordMismatchError,
  AuditRecordMissingError,
  AuthorizationError,
  IllegalCommandError,
  SessionAlreadyExistsError,
  SessionNotFoundError,
  UnknownCommandKindError,
} from './errors.js';
import type { AgentPortName } from './errors.js';
import type {
  AgentInteractionPort,
  AgentSolutionSurfacePort,
  AgentWorldStorePort,
} from './ports.js';
import type { AgentCommandResult, AgentCommandValue, AgentCommandValueMap } from './results.js';
import { isAgentCommandAuditRecord } from './audit.js';
import type { AgentCommandAuditRecord, AgentCommandOutcome } from './audit.js';
import type { AgentSessionDescriptor, AgentSessionRestoreSource } from './session.js';
import type { AgentToolsOverview } from './overview.js';
import { canonicalJson, sha256Hex } from './hash.js';
import type { AgentSolutionInfo } from './values.js';

const PORT_BY_KIND: Readonly<Record<AgentCommandKind, AgentPortName>> = {
  'solution.open': 'solution-surface',
  'solution.select': 'world-interaction',
  'solution.inspect': 'solution-surface',
  'solution.navigate': 'world-interaction',
  'solution.isolate': 'world-interaction',
  'solution.measure': 'world-interaction',
  'solution.annotate': 'world-interaction',
  'solution.simulate': 'solution-surface',
  'solution.observe': 'world-interaction',
};

export interface AgentToolDispatcherOptions {
  readonly surface: AgentSolutionSurfacePort;
  readonly interaction: AgentInteractionPort;
  readonly worldStore: AgentWorldStorePort;
}

interface AgentSessionState {
  readonly sessionId: string;
  readonly auditRefs: string[];
  openSolution: AgentSolutionInfo | null;
  lastCommandDigest: string | null;
  readonly outcomeCounts: { succeeded: number; denied: number };
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
    if (!isPort(candidate.worldStore, ['appendCommandRecord', 'getCommandRecord', 'listCommandRecords'])) {
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
    const state: AgentSessionState = {
      sessionId,
      auditRefs: [],
      openSolution: null,
      lastCommandDigest: null,
      outcomeCounts: { succeeded: 0, denied: 0 },
    };
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
      this.noteDispatch(session, digest, 'succeeded', false);
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
      this.noteDispatch(session, digest, 'denied', true);
      throw new AuthorizationError(denial);
    }

    // Defensive: unreachable — authorized commands always have an attached session (step 3).
    if (session === undefined) {
      throw new SessionNotFoundError(cmd.sessionId);
    }

    // 6. Preconditions are typed errors too.
    assertOpenSolution(kind, session);

    // 7. Execute through the ports (Solution Surface + interaction commands only).
    let value: AgentCommandValue;
    try {
      value = await this.executeCommand(cmd, session.openSolution);
    } catch (error) {
      if (error instanceof AgentToolsError) {
        throw error;
      }
      throw new AgentPortError(PORT_BY_KIND[kind], kind, error);
    }

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
    this.noteDispatch(session, digest, 'succeeded', true);
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

    const outcomeCounts = { succeeded: 0, denied: 0 };
    let openSolution: AgentSolutionInfo | null = null;
    const lastCommandDigest =
      auditRefs.length > 0 ? auditRefs[auditRefs.length - 1] : null;

    for (const digest of auditRefs) {
      const record = await this.worldStore.getCommandRecord(digest);
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

    const state: AgentSessionState = {
      sessionId,
      auditRefs,
      openSolution,
      lastCommandDigest,
      outcomeCounts,
    };
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
      .sort((left, right) => (left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0));
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

  private noteDispatch(
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

  private async executeCommand(
    command: AgentCommand,
    openSolution: AgentSolutionInfo | null,
  ): Promise<AgentCommandValue> {
    switch (command.kind) {
      case 'solution.open': {
        const solution = await this.surface.openSolution({
          solutionId: command.params.solutionId,
          revision: command.params.revision,
          readOnly: command.params.readOnly,
        });
        return { solution };
      }
      case 'solution.select': {
        const selection = await this.interaction.applySelection({
          mode: command.params.mode,
          elementIds: command.params.elementIds,
        });
        return { selection };
      }
      case 'solution.inspect': {
        const report = await this.surface.inspectSolution({
          elementIds: command.params.elementIds,
          includeProperties: command.params.includeProperties === true,
          includeRelations: command.params.includeRelations === true,
        });
        return { elements: report.elements };
      }
      case 'solution.navigate': {
        const navigation = await this.interaction.applyNavigation({
          target: command.params.target,
          options: command.params.options,
        });
        return { navigation };
      }
      case 'solution.isolate': {
        const isolation = await this.interaction.applyIsolation({
          mode: command.params.mode,
          elementIds: command.params.elementIds,
        });
        return { isolation };
      }
      case 'solution.measure': {
        const measurement = await this.interaction.measure(command.params);
        return { measurement };
      }
      case 'solution.annotate': {
        const annotation = await this.interaction.applyAnnotation(command.params);
        return { annotation };
      }
      case 'solution.simulate': {
        const simulation = await this.surface.simulateSolution({
          scenarioId: command.params.scenarioId,
          inputs: command.params.inputs,
        });
        return { simulation };
      }
      case 'solution.observe': {
        const interactionState = await this.interaction.getInteractionState();
        const includeInteractionState = command.params.includeInteractionState !== false;
        const observation = {
          openSolution,
          interaction: includeInteractionState ? interactionState : null,
        };
        return { observation };
      }
    }
  }
}

function isPort(candidate: unknown, methodNames: readonly string[]): boolean {
  if (candidate === null || typeof candidate !== 'object') {
    return false;
  }
  return methodNames.every((name) => typeof (candidate as Record<string, unknown>)[name] === 'function');
}

function assertOpenSolution(kind: AgentCommandKind, session: AgentSessionState): void {
  if (kind === 'solution.open') {
    return;
  }
  if (session.openSolution === null) {
    throw new IllegalCommandError([
      `command kind "${kind}" requires an open solution; dispatch solution.open for session "${session.sessionId}" first`,
    ]);
  }
}

function toDescriptor(state: AgentSessionState): AgentSessionDescriptor {
  return {
    sessionId: state.sessionId,
    openSolution: state.openSolution === null ? null : { ...state.openSolution },
    auditRefs: [...state.auditRefs],
    commandCount: state.auditRefs.length,
    lastCommandDigest: state.lastCommandDigest,
    outcomeCounts: { succeeded: state.outcomeCounts.succeeded, denied: state.outcomeCounts.denied },
  };
}
