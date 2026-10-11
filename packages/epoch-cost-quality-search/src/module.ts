export const MODULE_MANIFEST = {
  name: "@zcode/epoch-cost-quality-search",
  workOrder: "W033",
  role: "cost/quality frontier and alternative search (typed data + deterministic machines)",
  publicEntrypoints: ["src/index.ts (re-exports src/contract.ts)"],
  contractHome: "src/contract.ts",
  laws: [
    "no execution authority: never spawns processes; verification commands are data",
    "hash law: SHA-256 via node:crypto createHash only",
    "canonical serialization: sorted-key JSON via internal/canonical.ts",
    "identity law: baselines and candidates are distinct types; candidates reference their baseline by digest",
    "no second semantic authority: capability/requirement semantics arrive as data; this package composes references",
  ],
  upstreamReferences: [
    "W027 task-conditioned reconstruction policy (profiles/fitness/VOI) — consumed as data refs",
    "W030 capability evaluation (metric descriptors, hard constraints, qualification) — consumed as data refs",
  ],
} as const;
