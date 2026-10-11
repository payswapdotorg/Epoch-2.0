import { canonicalDigest } from "./internal/digest.js";

/**
 * Module manifest (W033 module-artifact law): the declarative inventory of
 * this package's artifacts and the law ids (declared in src/contract.ts)
 * it is bound by. Digest is over the canonical manifest data.
 */

export interface ModuleArtifactEntry {
  readonly path: string;
  readonly role: string;
}

export interface ModuleManifest {
  readonly moduleName: string;
  readonly packageName: string;
  readonly workOrder: string;
  readonly version: string;
  readonly summary: string;
  readonly entrypoint: string;
  readonly contractHome: string;
  readonly artifacts: readonly ModuleArtifactEntry[];
  readonly lawIds: readonly string[];
  readonly runtimeDependencies: readonly string[];
}

export const moduleManifest: ModuleManifest = {
  moduleName: "epoch-cost-quality-search",
  packageName: "@zcode/epoch-cost-quality-search",
  workOrder: "W033",
  version: "0.1.0",
  summary:
    "Cost/quality frontier and alternative search as typed data and deterministic machines.",
  entrypoint: "src/index.ts",
  contractHome: "src/contract.ts",
  artifacts: [
    { path: "src/index.ts", role: "public entrypoint" },
    { path: "src/contract.ts", role: "contract home" },
    { path: "src/module.ts", role: "module manifest" },
    { path: "src/metrics.ts", role: "metric composition" },
    { path: "src/requirements.ts", role: "requirements model" },
    { path: "src/capabilities.ts", role: "capability registry intake" },
    { path: "src/cost.ts", role: "lifecycle cost model" },
    { path: "src/generation.ts", role: "solution identity + generation" },
    { path: "src/frontier.ts", role: "frontier evaluation" },
    { path: "src/plan.ts", role: "implementation planning" },
    { path: "src/outcomes.ts", role: "actual-vs-predicted tracking" },
    { path: "src/internal/compare.ts", role: "internal comparison" },
    { path: "src/internal/guards.ts", role: "internal runtime guards" },
    { path: "src/internal/canonical.ts", role: "internal canonical JSON" },
    { path: "src/internal/digest.ts", role: "internal SHA-256 digests" },
    { path: "src/capabilities.test.ts", role: "test" },
    { path: "src/cost.test.ts", role: "test" },
    { path: "src/generation.test.ts", role: "test" },
    { path: "src/frontier.test.ts", role: "test" },
    { path: "src/plan.test.ts", role: "test" },
    { path: "src/outcomes.test.ts", role: "test" },
    { path: "src/contract.test.ts", role: "test" },
    { path: "package.json", role: "package manifest" },
    { path: "tsconfig.json", role: "typescript config" },
  ],
  lawIds: [
    "no-execution-authority",
    "sha256-via-node-crypto",
    "canonical-serialization",
    "separate-revision-identity",
    "hard-constraints-fail-closed",
    "preferences-are-data",
    "no-hidden-rounding",
    "alternatives-from-declarations",
    "verification-commands-are-data",
    "deterministic-ordering",
  ],
  runtimeDependencies: [],
};

/** SHA-256 over the canonical module manifest. */
export function moduleManifestDigest(): string {
  return canonicalDigest(moduleManifest);
}
