import { CONTRACT_LAWS } from "./contract.js";

/**
 * Module artifact manifest for @zcode/epoch-productization (W026).
 * Data only — this manifest describes the module and its laws; it is
 * not executed and confers no authority.
 */

export interface ModuleArtifactManifest {
  readonly kind: "module-artifact";
  readonly module: string;
  readonly workOrder: string;
  readonly version: string;
  readonly role: "infrastructure-adapter";
  readonly semanticAuthority: "none";
  readonly executionAuthority: "plans-and-verifies-only";
  readonly publicEntrypoint: string;
  readonly contractHome: string;
  readonly laws: readonly string[];
  readonly sourceFiles: readonly {
    readonly path: string;
    readonly role: string;
  }[];
  readonly testBattery: readonly string[];
  readonly qaArtifacts: readonly string[];
  readonly consumes: readonly {
    readonly module: string;
    readonly surface: string;
    readonly writes: "never";
  }[];
  /** Law: this package keeps ZERO runtime dependencies (always []). */
  readonly runtimeDependencies: readonly string[];
}

export const MODULE_ARTIFACT: ModuleArtifactManifest = Object.freeze({
  kind: "module-artifact",
  module: "@zcode/epoch-productization",
  workOrder: "W026",
  version: "0.1.0",
  role: "infrastructure-adapter",
  semanticAuthority: "none",
  executionAuthority: "plans-and-verifies-only",
  publicEntrypoint: "src/index.ts",
  contractHome: "src/contract.ts",
  laws: CONTRACT_LAWS,
  sourceFiles: Object.freeze([
    { path: "src/module.ts", role: "module manifest" },
    { path: "src/contract.ts", role: "contract home" },
    { path: "src/canonical.ts", role: "canonical serialization + sha256" },
    { path: "src/deployment-targets.ts", role: "deployment target matrix data" },
    { path: "src/release-checklist.ts", role: "release gates data" },
    { path: "src/deployment-plan.ts", role: "deterministic plan derivation" },
    { path: "src/store-integrity.ts", role: "read-only WorldStore sweep" },
    { path: "src/store-health.ts", role: "store health projection" },
    { path: "src/security-checklist.ts", role: "security review data" },
    { path: "src/secret-scan.ts", role: "pure secret matcher" },
    { path: "src/telemetry.ts", role: "privacy-safe telemetry contract" },
    { path: "src/packaging.ts", role: "release manifest verification" },
    { path: "src/index.ts", role: "public entrypoint" },
  ].map((entry) => Object.freeze(entry))),
  testBattery: Object.freeze([
    "test/canonical.test.ts",
    "test/contract-surface.test.ts",
    "test/deployment.test.ts",
    "test/packaging.test.ts",
    "test/security.test.ts",
    "test/store-integrity.test.ts",
    "test/telemetry.test.ts",
  ]),
  qaArtifacts: Object.freeze([
    "qa/epoch-productization/run-plan-step.mjs",
    "qa/epoch-productization/ACCEPTANCE.md",
    "qa/epoch-productization/store-snapshot.example.json",
  ]),
  consumes: Object.freeze([
    Object.freeze({
      module: "@zcode/epoch-persistence",
      surface:
        "WorldStore (structural read-only port; no compile-time import — the minimal port is declared in src/store-integrity.ts and satisfied structurally)",
      writes: "never",
    }),
  ]),
  runtimeDependencies: Object.freeze([]),
});

export function moduleSummary(): string {
  return [
    MODULE_ARTIFACT.module,
    MODULE_ARTIFACT.version,
    `work-order=${MODULE_ARTIFACT.workOrder}`,
    `role=${MODULE_ARTIFACT.role}`,
    `semantic-authority=${MODULE_ARTIFACT.semanticAuthority}`,
    `execution=${MODULE_ARTIFACT.executionAuthority}`,
    `source-files=${MODULE_ARTIFACT.sourceFiles.length}`,
  ].join(" ");
}
