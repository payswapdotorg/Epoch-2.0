/**
 * Public entrypoint for @zcode/epoch-productization.
 * - contract surface: src/contract.ts (contract home)
 * - module manifest: src/module.ts
 * This package plans and verifies releases; it never executes commands
 * and never deploys.
 */
export * from "./contract.js";
export { MODULE_ARTIFACT, moduleSummary } from "./module.js";
export type { ModuleArtifactManifest } from "./module.js";
