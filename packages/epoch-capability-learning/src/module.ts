/**
 * Module artifact (manifest) for `@zcode/epoch-capability-learning` (W032).
 *
 * Declares the module identity, authority boundaries, honored laws,
 * digest-only dependencies and ownership. Pure data — no behavior.
 */

export const MODULE_ID = "epoch-capability-learning";
export const MODULE_VERSION = "0.1.0";

export interface ModuleLaw {
  readonly law: string;
  readonly note: string;
}

export interface ModuleDependencyRef {
  readonly moduleId: string;
  readonly workOrder: string;
  readonly mode: "digest-reference";
  readonly note: string;
}

export interface ModuleManifest {
  readonly moduleId: string;
  readonly packageName: string;
  readonly version: string;
  readonly workOrder: string;
  readonly role: string;
  readonly authority: {
    readonly execution: "none";
    readonly semantics: "gap-learning-and-promotion domain only";
  };
  readonly laws: readonly ModuleLaw[];
  readonly dependencies: readonly ModuleDependencyRef[];
  readonly entrypoints: readonly string[];
  readonly ownership: readonly string[];
}

export const moduleManifest: ModuleManifest = {
  moduleId: MODULE_ID,
  packageName: "@zcode/epoch-capability-learning",
  version: MODULE_VERSION,
  workOrder: "W032",
  role: "Governed capability-gap learning and promotion: gap records with deterministic routing, versioned learning candidates with held-out replay validation, reuse permissions, human-approved promotion with rollback metadata, and regression watching.",
  authority: {
    execution: "none",
    semantics: "gap-learning-and-promotion domain only",
  },
  laws: [
    {
      law: "module-artifact-law",
      note: "src/module.ts manifest + src/contract.ts contract home; every file <=400 lines post-fmt; contract.ts <=300 lines post-fmt.",
    },
    {
      law: "hash-law",
      note: 'All digests are SHA-256 via node:crypto createHash("sha256"); SHA-256 is never hand-rolled.',
    },
    {
      law: "canonical-serialization-law",
      note: "Digests are computed over canonicalJson (sorted keys, no whitespace, domain-separated).",
    },
    {
      law: "no-second-semantic-authority",
      note: "W029 activity, W030 evaluation and W023 capability records are referenced by digest only; their semantics are never re-derived here.",
    },
    {
      law: "no-execution-authority",
      note: "No process, network or filesystem execution; replay observations are supplied by the caller; rollback is advisory only.",
    },
    {
      law: "human-in-the-loop-law",
      note: "Promotion requires a typed human proposal and a distinct typed human approval; nothing auto-promotes.",
    },
  ],
  dependencies: [
    {
      moduleId: "epoch-environment-activity",
      workOrder: "W029",
      mode: "digest-reference",
      note: "Demonstrations, outcomes, episodes and human interventions are referenced by digest only.",
    },
    {
      moduleId: "epoch-capability-evaluation",
      workOrder: "W030",
      mode: "digest-reference",
      note: "Qualification decisions and regression semantics are referenced by digest only.",
    },
    {
      moduleId: "epoch-capability-discovery",
      workOrder: "W023",
      mode: "digest-reference",
      note: "Discovered capability declarations are referenced by digest only.",
    },
  ],
  entrypoints: ["src/index.ts"],
  ownership: [
    "packages/epoch-capability-learning/**",
    "qa/epoch-capability-learning/**",
  ],
};
