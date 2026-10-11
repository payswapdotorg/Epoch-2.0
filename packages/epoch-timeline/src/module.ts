/**
 * Module manifest for `epoch-timeline` (W021/W011/W012/W023 pattern).
 */
export const epochTimelineModule = {
  id: "epoch-timeline",
  requires: ["epoch-world-model", "epoch-construction-fixture"],
  provides: [
    "construction-phase projection over world revisions",
    "timeline model with canonical digest identity",
    "portable timeline position",
    "entity visibility view-filter projection",
    "derived renderer-neutral animation steps",
    "digest-bound timeline cursor",
    "deterministic pure TimelineBuilder",
    "honest as-built fallback model",
  ],
  publicEntrypoints: ["index.ts"],
} as const;
