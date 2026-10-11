/**
 * W024 — Agent Tools: the closed vocabulary of agent command kinds and
 * authorization scopes.
 *
 * This vocabulary is data — it declares WHAT agents may ask for. Enforcement
 * lives in the dispatcher (the authorization law) and is driven exclusively by
 * caller-supplied `AgentAuthorization` declarations.
 */

/** Every command kind an agent can dispatch through `AgentToolDispatcher`. */
export const AGENT_COMMAND_KINDS = Object.freeze([
  "solution.open",
  "solution.select",
  "solution.inspect",
  "solution.navigate",
  "solution.isolate",
  "solution.measure",
  "solution.annotate",
  "solution.simulate",
  "solution.observe",
] as const);

export type AgentCommandKind = (typeof AGENT_COMMAND_KINDS)[number];

/** Coarse capability scopes: finer-grained than kinds, coarser than params. */
export const AGENT_SCOPES = Object.freeze([
  "solution.read",
  "solution.interact",
  "solution.annotate",
  "solution.simulate",
] as const);

export type AgentScope = (typeof AGENT_SCOPES)[number];

/**
 * The scopes every command kind REQUIRES. The dispatcher checks that the
 * caller-supplied authorization grants all of them (default deny).
 */
export const REQUIRED_SCOPES_BY_KIND: Readonly<
  Record<AgentCommandKind, readonly AgentScope[]>
> = Object.freeze({
  "solution.open": Object.freeze(["solution.read"] as const),
  "solution.select": Object.freeze(["solution.interact"] as const),
  "solution.inspect": Object.freeze(["solution.read"] as const),
  "solution.navigate": Object.freeze(["solution.interact"] as const),
  "solution.isolate": Object.freeze(["solution.interact"] as const),
  "solution.measure": Object.freeze(["solution.interact"] as const),
  "solution.annotate": Object.freeze(["solution.annotate"] as const),
  "solution.simulate": Object.freeze(["solution.simulate"] as const),
  "solution.observe": Object.freeze(["solution.read"] as const),
});

export function requiredScopesFor(
  kind: AgentCommandKind,
): readonly AgentScope[] {
  return REQUIRED_SCOPES_BY_KIND[kind];
}

export function isAgentCommandKind(value: unknown): value is AgentCommandKind {
  return (
    typeof value === "string" &&
    (AGENT_COMMAND_KINDS as readonly string[]).includes(value)
  );
}

export function isAgentScope(value: unknown): value is AgentScope {
  return (
    typeof value === "string" &&
    (AGENT_SCOPES as readonly string[]).includes(value)
  );
}
