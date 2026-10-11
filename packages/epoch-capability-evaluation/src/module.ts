// Module manifest (module-artifact law). This module is data only: no behavior export.

export const MODULE_MANIFEST = Object.freeze({
  kind: "module-manifest",
  moduleName: "@zcode/epoch-capability-evaluation",
  workOrder: "W030",
  layer: "capability-quality",
  role: "capability-quality-lab",
  contractHome: "./src/contract.ts",
  publicEntrypoint: "./src/index.ts",
  frozenInputs: Object.freeze(["@zcode/epoch-capability-discovery"]),
  authority: Object.freeze({
    execution: "none",
    semantics: "single",
    mutableRegistries: "none",
  }),
  laws: Object.freeze([
    "module-artifact",
    "contract-home",
    "files-max-400-lines",
    "contract-max-300-lines",
    "hash-node-crypto-sha256",
    "canonical-serialization",
    "deterministic-pure-functions",
    "no-execution-authority",
  ]),
  hashing: Object.freeze({
    algorithm: "sha256",
    implementation: "node:crypto",
    canonicalForm: "canonical-json-sorted-keys",
  }),
  files: Object.freeze({
    "src/module.ts": "manifest",
    "src/contract.ts": "contract home (shared public types)",
    "src/digest.ts": "canonical serialization + sha256",
    "src/qualification.ts": "status vocabulary + transition lattice",
    "src/catalog.ts": "metric descriptors + per-class selections (frozen data)",
    "src/corpus.ts":
      "corpus rights/repeatability validation + corpus rejection vocabulary",
    "src/descriptor.ts":
      "benchmark descriptor validation + descriptor rejection vocabulary",
    "src/limits.ts": "known-limit validation + limit rejection vocabulary",
    "src/harness-measure.ts":
      "harness vocabulary, measurement collection, versioned digests",
    "src/harness-decision.ts": "qualification decision synthesis",
    "src/harness.ts": "differential conformance harness (runBenchmark)",
    "src/regression.ts": "drift + regression detection + report vocabulary",
    "src/release.ts": "capability release gate + release vocabulary",
    "src/discovery-adapter.ts":
      "W023 discovery-spine adapter + adapter vocabulary",
    "src/index.ts": "public entrypoint",
  }),
});

export type ModuleManifest = typeof MODULE_MANIFEST;

export function moduleManifest(): ModuleManifest {
  return MODULE_MANIFEST;
}
