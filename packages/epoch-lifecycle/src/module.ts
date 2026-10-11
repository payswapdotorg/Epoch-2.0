/**
 * Module manifest for @zcode/epoch-lifecycle (W022), following the frozen
 * W021 epoch-persistence convention: every managed module ships a
 * src/module.ts manifest alongside src/contract.ts and src/index.ts.
 *
 * The manifest is data only. `requires` lists the frozen packages this
 * module consumes (type-only imports plus the WorldStore port);
 * `provides` names the capabilities this module actually delivers:
 * the ten-phase machine, the phase catalog, policy validation, canonical
 * state serialization + digests, the WorldStore persistence binding, and
 * the read-only overview projection.
 */

export const epochLifecycleModule = {
  id: "epoch-lifecycle",
  requires: ["epoch-world-model", "epoch-solution-contract", "epoch-persistence"],
  provides: [
    "engineering-lifecycle-machine",
    "lifecycle-phase-catalog",
    "lifecycle-policy-validation",
    "lifecycle-state-canonicalization",
    "lifecycle-persistence-binding",
    "lifecycle-overview-projection",
  ],
  publicEntrypoints: ["index.ts"],
} as const;
