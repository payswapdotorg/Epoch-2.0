/**
 * Module manifest (module-artifact law) for
 * @zcode/epoch-capability-reproduction — W031 Capability Reproduction Factory.
 */
export const moduleManifest = {
  name: "@zcode/epoch-capability-reproduction",
  version: "0.1.0",
  workOrder: "W031",
  role: "governed capability reproduction factory (plans and records only)",
  authority: {
    execution: "none",
    semantics: [
      "reproduction intake verdicts",
      "alternatives analysis records",
      "rights and provenance gate records",
      "reference behavior case capture",
      "foundation selection policy",
      "reproduction lifecycle state machine",
      "mini-app surface registration descriptors",
    ],
  },
  frozenDependencies: [
    "@zcode/epoch-application-environment (W028, workbench surface authority)",
    "@zcode/epoch-environment-activity (W029, demonstrations/candidate exports)",
    "@zcode/epoch-capability-evaluation (W030, benchmarks/qualification)",
  ],
  laws: [
    "module-artifact: src/module.ts manifest + src/contract.ts contract home",
    "sha256 only via node:crypto createHash",
    "canonical-json serialization for every digest",
    "no second semantic authority: W028/W029/W030 bind by digest ref",
    "no execution authority: the factory never builds or deploys",
  ],
  artifacts: [
    "src/module.ts",
    "src/contract.ts",
    "src/result.ts",
    "src/digest.ts",
    "src/bindings.ts",
    "src/intake.ts",
    "src/alternatives.ts",
    "src/rights.ts",
    "src/reference.ts",
    "src/foundation.ts",
    "src/plans.ts",
    "src/surface.ts",
    "src/gates.ts",
    "src/lifecycle.ts",
    "src/index.ts",
  ],
} as const;

export type ModuleManifest = typeof moduleManifest;
