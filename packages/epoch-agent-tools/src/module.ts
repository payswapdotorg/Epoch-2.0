/**
 * W024 — Agent Tools: module manifest (W021/W011/W012/W018/W023/W029 pattern).
 *
 * Declares what this module requires, provides and exposes. Pure data for the
 * architecture tooling — no runtime behavior.
 */
export const epochAgentToolsModule = {
  id: "epoch-agent-tools",
  requires: [
    "epoch-solution-surface",
    "epoch-world-model",
    "epoch-world-interaction",
    "epoch-persistence",
  ],
  provides: [
    "typed agent command contracts: the nine-kind AgentCommand union with provenance and authorization references",
    "default-deny authorization law over caller-supplied capability-token declarations",
    "digest-keyed append-only command audit with idempotent replay, persisted through the WorldStore port",
    "agent session descriptors with audit refs by digest and restore-by-digest re-attachment",
    "read-only AgentToolsOverview projection of command kinds, sessions and audit summary",
    "no-renderer architecture boundary: a typed facade over the solution surface and interaction ports",
  ],
  publicEntrypoints: ["index.ts"],
} as const;
