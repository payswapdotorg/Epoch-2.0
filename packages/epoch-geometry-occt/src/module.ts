/**
 * W011 module manifest (architecture module artifact, pattern per W021).
 * Geometry PROVIDER only: the world model stays the single semantic
 * authority; the world bridge derives, never owns.
 */
export const epochGeometryOcctModule = {
  id: "epoch-geometry-occt",
  requires: ["epoch-world-model", "epoch-reconstruction-contract"],
  provides: ["brep-kernel-port", "analytic-geometry-adapter", "in-memory-test-kernel", "derive-only-world-bridge"],
  publicEntrypoints: ["index.ts"],
} as const;
