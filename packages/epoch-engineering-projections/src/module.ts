import { sha256Json } from "./canonical.js";
import type { JsonValue } from "./canonical.js";
import type { Digest } from "./types/shared.js";

export const MODULE_NAME = "epoch-engineering-projections";

export type ModuleArtifactRole =
  | "canonical"
  | "contract"
  | "validate"
  | "types"
  | "machine"
  | "manifest"
  | "barrel";

export interface ModuleArtifact {
  readonly path: string;
  readonly role: ModuleArtifactRole;
  readonly summary: string;
}

export const MODULE_ARTIFACTS: readonly ModuleArtifact[] = [
  { path: "src/build/boq.ts", role: "machine", summary: "deterministic compileBoq machine" },
  {
    path: "src/build/constraint.ts",
    role: "machine",
    summary: "buildConstraint and validateConstraints machines",
  },
  {
    path: "src/build/finding.ts",
    role: "machine",
    summary: "buildFinding and advanceFindingStatus machines",
  },
  { path: "src/build/inspector.ts", role: "machine", summary: "deriveInspectorView machine" },
  { path: "src/build/limitations.ts", role: "machine", summary: "buildLimitationsReport machine" },
  { path: "src/build/links.ts", role: "machine", summary: "buildLinkIndex machine" },
  { path: "src/build/quantity.ts", role: "machine", summary: "buildQuantityTakeoff machine" },
  { path: "src/canonical.ts", role: "canonical", summary: "canonical JSON and sha-256 helpers" },
  { path: "src/contract.ts", role: "contract", summary: "public contract, laws, and assertion" },
  { path: "src/index.ts", role: "barrel", summary: "public barrel exporting the runtime contract" },
  { path: "src/module.ts", role: "manifest", summary: "module manifest and digest" },
  { path: "src/types/boq.ts", role: "types", summary: "BOQ domain types" },
  { path: "src/types/constraint.ts", role: "types", summary: "constraint domain types" },
  { path: "src/types/finding.ts", role: "types", summary: "finding and link-index domain types" },
  { path: "src/types/inspector.ts", role: "types", summary: "inspector read-model types" },
  { path: "src/types/limitations.ts", role: "types", summary: "limitations report types" },
  { path: "src/types/quantity.ts", role: "types", summary: "quantities law types" },
  { path: "src/types/shared.ts", role: "types", summary: "branded primitives and shared shapes" },
  { path: "src/validate.ts", role: "validate", summary: "shared validators and result helpers" },
];

const manifestValue: JsonValue = {
  moduleName: MODULE_NAME,
  artifacts: MODULE_ARTIFACTS.map((artifact) => ({
    path: artifact.path,
    role: artifact.role,
    summary: artifact.summary,
  })),
};

/** Canonical sha-256 digest over the module manifest. */
export const moduleManifestDigest: Digest = sha256Json(manifestValue);
