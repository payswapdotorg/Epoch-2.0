import { digestCanonical } from "./canonical.js";
import type { Sha256Digest } from "./canonical.js";
import { CONTRACT_NAME, CONTRACT_REVISION } from "./contract.js";

/** Module name (matches package.json and CONTRACT_NAME). */
export const MODULE_NAME = "@zcode/epoch-engineering-objective";

/** Role of one src artifact in the module-artifact law. */
export type ModuleArtifactRole =
  | "canonical"
  | "contract"
  | "validate"
  | "types"
  | "machine"
  | "manifest"
  | "barrel";

/** One manifest entry: a src file, its role and its summary. */
export interface ModuleArtifact {
  readonly path: string;
  readonly role: ModuleArtifactRole;
  readonly summary: string;
}

/** The src artifact manifest (module-artifact law). */
export const MODULE_ARTIFACTS: readonly ModuleArtifact[] = [
  {
    path: "src/canonical.ts",
    role: "canonical",
    summary: "canonical JSON serialization + node:crypto sha256 (hash law)",
  },
  {
    path: "src/contract.ts",
    role: "contract",
    summary: "contract home: laws + public entrypoints + contract assertion",
  },
  {
    path: "src/validate.ts",
    role: "validate",
    summary: "shared input validators used by every builder",
  },
  {
    path: "src/types/core.ts",
    role: "types",
    summary: "branded primitives, digest/evidence refs, money, duration, quality",
  },
  {
    path: "src/types/task-family.ts",
    role: "types",
    summary: "task family, class rules and the explicit denominator type",
  },
  {
    path: "src/types/completion.ts",
    role: "types",
    summary: "completion records + verified-quality metric union (W020 semantics)",
  },
  {
    path: "src/types/measures.ts",
    role: "types",
    summary: "baselines, intervention measures and the gated progress verdicts",
  },
  {
    path: "src/types/safety.ts",
    role: "types",
    summary: "hard-constraint regression measures + summary",
  },
  {
    path: "src/types/rates.ts",
    role: "types",
    summary: "execution modes, escalation + capability-reuse rates (visibility law)",
  },
  {
    path: "src/types/variance.ts",
    role: "types",
    summary: "predicted/actual outcomes, feasibility, abundance claims",
  },
  {
    path: "src/types/end-to-end.ts",
    role: "types",
    summary: "the five canonical stages, sealed digest chain, limitations report",
  },
  {
    path: "src/types/evaluation.ts",
    role: "types",
    summary: "abundance evaluation input/output composition",
  },
  {
    path: "src/build/denominators.ts",
    role: "machine",
    summary: "task families + explicit automation denominators",
  },
  {
    path: "src/build/completion.ts",
    role: "machine",
    summary: "completion records + verified-quality metrics and shares",
  },
  {
    path: "src/build/measures.ts",
    role: "machine",
    summary: "baselines, interventions + the intervention-progress gate",
  },
  {
    path: "src/build/safety.ts",
    role: "machine",
    summary: "safety-regression measures + summaries",
  },
  {
    path: "src/build/rates.ts",
    role: "machine",
    summary: "execution records, escalation + capability-reuse rates",
  },
  {
    path: "src/build/variance.ts",
    role: "machine",
    summary: "prediction-variance records + the abundance-claim feasibility gate",
  },
  {
    path: "src/build/end-to-end.ts",
    role: "machine",
    summary: "end-to-end case builder/verifier + limitations report",
  },
  {
    path: "src/build/evaluation.ts",
    role: "machine",
    summary: "the composed abundance evaluation machine",
  },
  { path: "src/module.ts", role: "manifest", summary: "this manifest + module identity digest" },
  { path: "src/index.ts", role: "barrel", summary: "public barrel exporting exactly the contract" },
];

/** Deterministic identity digest over the manifest + contract identity. */
export function moduleIdentityDigest(): Sha256Digest {
  return digestCanonical({
    moduleName: MODULE_NAME,
    contractName: CONTRACT_NAME,
    contractRevision: CONTRACT_REVISION,
    artifacts: MODULE_ARTIFACTS,
  });
}
