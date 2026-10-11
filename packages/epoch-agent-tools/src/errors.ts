/**
 * W024 — Agent Tools: the typed error taxonomy. Illegal/unauthorized commands
 * are typed errors — never silent corrections — and every error carries a
 * stable machine-readable `code`.
 */
import type { AgentCommandKind, AgentScope } from './kinds.js';
import type { AgentDeniedReason } from './authorization.js';
import type { AgentCommandOutcome } from './audit.js';

export type AgentErrorCode =
  | 'authorization-denied'
  | 'illegal-command'
  | 'unknown-command-kind'
  | 'session-not-found'
  | 'session-already-exists'
  | 'audit-digest-collision'
  | 'audit-outcome-conflict'
  | 'audit-record-missing'
  | 'audit-record-mismatch'
  | 'port-error';

export type AgentPortName = 'solution-surface' | 'world-interaction';

export class AgentToolsError extends Error {
  readonly code: AgentErrorCode;

  constructor(code: AgentErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Typed denial with the denied reason (authorization law). */
export class AuthorizationError extends AgentToolsError {
  readonly deniedReason: AgentDeniedReason;
  readonly requiredScopes: readonly AgentScope[];
  readonly missingScopes: readonly AgentScope[];
  readonly allowedCommands: readonly AgentCommandKind[];

  constructor(denial: {
    readonly deniedReason: AgentDeniedReason;
    readonly message: string;
    readonly requiredScopes?: readonly AgentScope[];
    readonly missingScopes?: readonly AgentScope[];
    readonly allowedCommands?: readonly AgentCommandKind[];
  }) {
    super('authorization-denied', denial.message);
    this.deniedReason = denial.deniedReason;
    this.requiredScopes = denial.requiredScopes ?? [];
    this.missingScopes = denial.missingScopes ?? [];
    this.allowedCommands = denial.allowedCommands ?? [];
  }
}

/**
 * The command failed structural validation; every issue is listed. Subclasses
 * may override the code (e.g. `unknown-command-kind`) via the third argument.
 */
export class IllegalCommandError extends AgentToolsError {
  readonly issues: readonly string[];

  constructor(
    issues: readonly string[],
    message?: string,
    code: AgentErrorCode = 'illegal-command',
  ) {
    const list = issues.length > 0 ? issues : ['command is not a valid agent command'];
    super(code, message ?? `illegal agent command: ${list.join('; ')}`);
    this.issues = list;
  }
}

export class UnknownCommandKindError extends IllegalCommandError {
  readonly kind: string;

  constructor(kind: string) {
    super(
      [`unknown command kind "${kind}"`],
      `unknown agent command kind "${kind}"`,
      'unknown-command-kind',
    );
    this.kind = kind;
  }
}

export class SessionNotFoundError extends AgentToolsError {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super('session-not-found', `agent session "${sessionId}" is not attached to this dispatcher`);
    this.sessionId = sessionId;
  }
}

export class SessionAlreadyExistsError extends AgentToolsError {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super('session-already-exists', `agent session "${sessionId}" is already attached to this dispatcher`);
    this.sessionId = sessionId;
  }
}

export class AuditDigestCollisionError extends AgentToolsError {
  readonly digest: string;

  constructor(digest: string) {
    super('audit-digest-collision', `audit record for digest "${digest}" already exists with different content`);
    this.digest = digest;
  }
}

/**
 * The append-only audit log already fixed a different outcome for this
 * digest. Vary `provenance.correlationId` to issue a distinct command.
 */
export class AuditOutcomeConflictError extends AgentToolsError {
  readonly digest: string;
  readonly recordedOutcome: AgentCommandOutcome;

  constructor(digest: string, recordedOutcome: AgentCommandOutcome) {
    super(
      'audit-outcome-conflict',
      `command digest "${digest}" was already recorded with outcome "${recordedOutcome}"; the append-only audit log fixes the outcome per digest — vary provenance.correlationId to issue a distinct command`,
    );
    this.digest = digest;
    this.recordedOutcome = recordedOutcome;
  }
}

export class AuditRecordMissingError extends AgentToolsError {
  readonly sessionId: string;
  readonly digest: string;

  constructor(sessionId: string, digest: string) {
    super(
      'audit-record-missing',
      `audit record "${digest}" referenced by session "${sessionId}" was not found in the world store`,
    );
    this.sessionId = sessionId;
    this.digest = digest;
  }
}

export class AuditRecordMismatchError extends AgentToolsError {
  readonly sessionId: string;
  readonly digest: string;
  readonly detail: string;

  constructor(sessionId: string, digest: string, detail: string) {
    super('audit-record-mismatch', `audit record "${digest}" does not match session "${sessionId}": ${detail}`);
    this.sessionId = sessionId;
    this.digest = digest;
    this.detail = detail;
  }
}

/** A consumed port (Solution Surface slice or interaction slice) failed. Not audited. */
export class AgentPortError extends AgentToolsError {
  readonly port: AgentPortName;
  readonly commandKind: AgentCommandKind;

  constructor(port: AgentPortName, commandKind: AgentCommandKind, cause?: unknown) {
    super(
      'port-error',
      `port "${port}" failed while executing command kind "${commandKind}"`,
      cause === undefined ? undefined : { cause },
    );
    this.port = port;
    this.commandKind = commandKind;
  }
}
