import { canonicalDigest } from "./canonical.js";
import type { CanonicalJsonValue } from "./canonical.js";
import type { Sha256Hex } from "./types/branded.js";

export const MODULE_NAME = "epoch-results-paraview";

export type ModuleRole =
  | "canonical"
  | "contract"
  | "validate"
  | "types"
  | "machine"
  | "manifest"
  | "barrel";

export interface ModuleArtifact {
  readonly path: string;
  readonly role: ModuleRole;
  readonly summary: string;
}

export const MODULE_ARTIFACTS: readonly ModuleArtifact[] = [
  {
    path: "src/canonical.ts",
    role: "canonical",
    summary: "canonical JSON serialization and sha256 digest helpers",
  },
  {
    path: "src/contract.ts",
    role: "contract",
    summary: "public contract laws, entries and assertions",
  },
  {
    path: "src/validate.ts",
    role: "validate",
    summary: "shared structural validators",
  },
  {
    path: "src/types/branded.ts",
    role: "types",
    summary: "branded sha256 hex digest primitive",
  },
  {
    path: "src/types/dataset.ts",
    role: "types",
    summary: "result dataset types and typed rejections",
  },
  {
    path: "src/types/paraview.ts",
    role: "types",
    summary: "ParaView state descriptor types and typed rejections",
  },
  {
    path: "src/types/projection.ts",
    role: "types",
    summary: "result projection record and coverage types",
  },
  {
    path: "src/types/limitations.ts",
    role: "types",
    summary: "limitations report types",
  },
  {
    path: "src/build/dataset.ts",
    role: "machine",
    summary: "validateResultDataset machine and dataset digest",
  },
  {
    path: "src/build/plugin-ref.ts",
    role: "machine",
    summary: "ParaView plugin provenance ref machine and digest",
  },
  {
    path: "src/build/state-descriptor.ts",
    role: "machine",
    summary: "ParaView state descriptor machine and digest",
  },
  {
    path: "src/build/projection.ts",
    role: "machine",
    summary: "projection record machine and coverage summary",
  },
  {
    path: "src/build/limitations.ts",
    role: "machine",
    summary: "honest limitations report machine",
  },
  {
    path: "src/module.ts",
    role: "manifest",
    summary: "module artifact manifest and digest",
  },
  {
    path: "src/index.ts",
    role: "barrel",
    summary: "public barrel re-exporting the contract",
  },
];

/** Deterministic sha256 digest over the module artifact manifest. */
export function moduleManifestDigest(): Sha256Hex {
  return canonicalDigest(MODULE_ARTIFACTS as unknown as CanonicalJsonValue);
}
