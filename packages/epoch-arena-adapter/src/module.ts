/**
 * Module manifest for @zcode/epoch-arena-adapter (module-artifact law).
 *
 * This file is the machine-readable manifest of the package: what it
 * is, what it exposes, which artifacts anchor the contract, and which
 * laws it obeys. It contains NO behavior.
 */

export const MODULE_NAME = "epoch-arena-adapter" as const;
export const MODULE_VERSION = "0.1.0" as const;
export const MODULE_LAYER = "protocol" as const;
export const MODULE_DESCRIPTION =
  "Arena expert loop and learnback: typed task packages with " +
  "privacy-preserving evidence exports, qualification metadata, typed " +
  "return packages validated on receipt, deterministic verification " +
  "against acceptance criteria, canonical world-revision proposals, " +
  "partial/rejected handling, independent reuse-rights decisions, and " +
  "a pure simulated Arena endpoint.";

export interface ModuleManifest {
  readonly name: string;
  readonly version: string;
  readonly layer: string;
  readonly entrypoints: readonly string[];
  readonly artifacts: readonly string[];
  readonly sources: readonly string[];
  readonly runtimeDependencies: readonly string[];
  readonly laws: readonly string[];
}

export const MODULE_MANIFEST: ModuleManifest = {
  name: MODULE_NAME,
  version: MODULE_VERSION,
  layer: MODULE_LAYER,
  entrypoints: ["src/index.ts"],
  artifacts: ["src/module.ts", "src/contract.ts"],
  sources: [
    "src/canonical.ts",
    "src/contract.ts",
    "src/index.ts",
    "src/module.ts",
    "src/return.ts",
    "src/revision.ts",
    "src/reuse.ts",
    "src/simulate.ts",
    "src/task.ts",
    "src/types-core.ts",
    "src/types-return.ts",
    "src/types-reuse.ts",
    "src/types-task.ts",
    "src/types-verdict.ts",
  ],
  runtimeDependencies: [],
  laws: [
    "module-artifact law: src/module.ts manifest + src/contract.ts contract home",
    "file limits: every src file <= 400 lines post-fmt; contract.ts <= 300 lines post-fmt",
    "hash law: SHA-256 only via node:crypto createHash — never hand-rolled",
    "canonical serialization: all digests are computed over canonicalJson",
    "no second semantic authority: emits proposals only, never writes world state",
    "no execution authority: pure, in-memory, no I/O, no clock, no network",
    "loose coupling: W025/W029/W032 records referenced by digest only",
  ],
};
