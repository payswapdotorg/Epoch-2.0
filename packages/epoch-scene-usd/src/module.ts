/**
 * Module manifest for @zcode/epoch-scene-usd (W011 pattern).
 *
 * USD is representation/composition only — never a semantic authority: this
 * module provides bounded scene composition (usda-subset parsing, layer
 * stacks, LIVRPS-bounded opinion resolution, canonical serialization) and a
 * derive-only world-model bridge; it never reconstructs or mutates world
 * semantics.
 */
export const epochSceneUsdModule = {
  id: "epoch-scene-usd",
  requires: ["epoch-reconstruction-contract", "epoch-world-model"],
  provides: [
    "usda-subset-parser",
    "layer-stack-resolution",
    "livrps-opinion-resolution",
    "variant-selection-resolution",
    "composition-diagnostics",
    "layer-arc-descriptions",
    "canonical-serialization",
    "derive-only-world-bridge",
  ],
  publicEntrypoints: ["index.ts"],
} as const;
