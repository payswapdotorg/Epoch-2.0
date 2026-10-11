/**
 * W024 — Agent Tools: the authorization law.
 *
 * `AgentAuthorization` is capability-token-style DATA supplied by the caller
 * (agents prove what they may do). It carries no enforcement logic; the
 * dispatcher validates kind + scope (+ optional session binding) against it
 * and throws typed `AuthorizationError`s on violation. The dispatcher never
 * grants authority by itself: empty grants deny everything.
 */
import {
  isAgentCommandKind,
  isAgentScope,
  requiredScopesFor,
  type AgentCommandKind,
  type AgentScope,
} from "./kinds.js";
import type { AgentCommand } from "./commands.js";
import {
  isNonEmptyString,
  isObject,
  isString,
  isStringArray,
} from "./guards.js";

export type AgentDeniedReason =
  | "missing-authorization"
  | "malformed-authorization"
  | "token-mismatch"
  | "command-kind-not-authorized"
  | "scope-not-authorized"
  | "session-not-bound";

/** Capability-token-style declaration: which command kinds + scopes a caller may invoke. */
export interface AgentAuthorization {
  readonly tokenId: string;
  readonly subject: string;
  readonly allowedCommands: readonly AgentCommandKind[];
  readonly scopes: readonly AgentScope[];
  /** When present, the token is only valid for these session ids. */
  readonly boundSessions?: readonly string[];
  readonly notes?: string;
}

export function isValidAgentAuthorization(
  value: unknown,
): value is AgentAuthorization {
  if (!isObject(value)) {
    return false;
  }
  if (
    !isNonEmptyString(value["tokenId"]) ||
    !isNonEmptyString(value["subject"])
  ) {
    return false;
  }
  const allowedCommands = value["allowedCommands"];
  if (
    !Array.isArray(allowedCommands) ||
    !allowedCommands.every((item) => isAgentCommandKind(item))
  ) {
    return false;
  }
  const scopes = value["scopes"];
  if (!Array.isArray(scopes) || !scopes.every((item) => isAgentScope(item))) {
    return false;
  }
  const boundSessions = value["boundSessions"];
  if (
    boundSessions !== undefined &&
    !(Array.isArray(boundSessions) && isStringArray(boundSessions))
  ) {
    return false;
  }
  const notes = value["notes"];
  if (notes !== undefined && !isString(notes)) {
    return false;
  }
  return true;
}

export interface AgentAuthorizationDenial {
  readonly deniedReason: AgentDeniedReason;
  readonly message: string;
  readonly requiredScopes: readonly AgentScope[];
  readonly missingScopes: readonly AgentScope[];
  readonly allowedCommands: readonly AgentCommandKind[];
}

/**
 * Pure evaluation of the authorization law for a single command. Returns
 * `null` when the caller-supplied authorization covers the command, or a
 * structured denial (consumed by the dispatcher to throw a typed
 * `AuthorizationError`). Pure data in, pure data out — no side effects.
 */
export function evaluateAuthorization(
  command: AgentCommand,
  authorization: unknown,
): AgentAuthorizationDenial | null {
  if (authorization === undefined || authorization === null) {
    return denial(
      "missing-authorization",
      "no AgentAuthorization was provided; agents must prove what they may do",
      [],
      [],
      [],
    );
  }
  if (!isValidAgentAuthorization(authorization)) {
    return denial(
      "malformed-authorization",
      "the provided AgentAuthorization is not a valid capability declaration",
      [],
      [],
      [],
    );
  }
  if (authorization.tokenId !== command.authorization.tokenId) {
    return denial(
      "token-mismatch",
      `command references authorization token "${command.authorization.tokenId}" but token "${authorization.tokenId}" was provided`,
      [],
      [],
      authorization.allowedCommands,
    );
  }
  if (!authorization.allowedCommands.includes(command.kind)) {
    return denial(
      "command-kind-not-authorized",
      `token "${authorization.tokenId}" does not allow command kind "${command.kind}"`,
      requiredScopesFor(command.kind),
      [],
      authorization.allowedCommands,
    );
  }
  const required = requiredScopesFor(command.kind);
  const missing = required.filter(
    (scope) => !authorization.scopes.includes(scope),
  );
  if (missing.length > 0) {
    return denial(
      "scope-not-authorized",
      `token "${authorization.tokenId}" is missing required scope(s) ${missing.join(", ")} for command kind "${command.kind}"`,
      required,
      missing,
      authorization.allowedCommands,
    );
  }
  if (
    authorization.boundSessions !== undefined &&
    !authorization.boundSessions.includes(command.sessionId)
  ) {
    return denial(
      "session-not-bound",
      `token "${authorization.tokenId}" is not bound to session "${command.sessionId}"`,
      [],
      [],
      authorization.allowedCommands,
    );
  }
  return null;
}

function denial(
  deniedReason: AgentDeniedReason,
  message: string,
  requiredScopes: readonly AgentScope[],
  missingScopes: readonly AgentScope[],
  allowedCommands: readonly AgentCommandKind[],
): AgentAuthorizationDenial {
  return {
    deniedReason,
    message,
    requiredScopes,
    missingScopes,
    allowedCommands,
  };
}
