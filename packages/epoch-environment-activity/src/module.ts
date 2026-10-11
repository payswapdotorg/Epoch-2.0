/**
 * Module manifest for @zcode/epoch-environment-activity (W029), following
 * the merged-package module.ts pattern (W021/W011/W012/W018/W023).
 */

export const epochEnvironmentActivityModule = {
  id: "epoch-environment-activity",
  requires: [
    "epoch-world-model",
    "epoch-application-environment",
    "epoch-persistence",
  ],
  provides: [
    "typed environment event core (per-session sequence numbers, typed initiators, evidence and state/result correlations by digest reference)",
    "consent and privacy capture laws (per-source scope, explicit redaction markers, retention and reuse as separate permissions)",
    "capture controller with pause/resume/inspect",
    "derived coverage, gap and redaction metadata (incomplete sequences typed, never represented as complete)",
    "activity episodes with user-stated and inferred intent as distinct fields",
    "demonstrations with explicit boundary metadata and digest-referenced result correlations",
    "unverified candidate exports for capability learning (never auto-promoted)",
    "digest-keyed persistence binding over the WorldStore port",
  ],
  publicEntrypoints: ["index.ts"],
} as const;
