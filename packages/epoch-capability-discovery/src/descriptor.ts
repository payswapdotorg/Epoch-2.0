/**
 * Package descriptor (W027 precedent: descriptor/module/index pattern).
 * Declares the authority posture of this package to any host or auditor.
 */
export const CAPABILITY_DISCOVERY_DESCRIPTOR = {
  name: "@zcode/epoch-capability-discovery",
  workOrder: "W023",
  purpose:
    "Evidence-derived capability discovery: deterministic, digest-keyed declarations of capabilities observed in evidence streams. Declaration-only — no execution authority, no world mutation, no scheduling, no repair.",
  authority: "declaration-only",
  executionAuthority: false,
  mutatesWorldRevisions: false,
  deterministic: true,
  consumes: [
    "@zcode/epoch-world-model",
    "@zcode/epoch-persistence",
    "@zcode/epoch-lifecycle",
  ],
  emits: [
    "DiscoveredCapability declarations",
    "DiscoveryNote (Learn-phase attachable)",
  ],
} as const;

export type CapabilityDiscoveryDescriptor =
  typeof CAPABILITY_DISCOVERY_DESCRIPTOR;
