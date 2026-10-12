import { sha256Canonical } from "./canonical.js";
import type { HexDigest } from "./canonical.js";

export const MODULE_NAME = "epoch-asset-import";

export type ModuleArtifactRole =
  | "canonical"
  | "contract"
  | "validate"
  | "types"
  | "machine"
  | "manifest"
  | "barrel";

export type ModuleArtifact = {
  readonly path: string;
  readonly role: ModuleArtifactRole;
  readonly summary: string;
};

export const MODULE_ARTIFACTS: readonly ModuleArtifact[] = [
  {
    path: "src/canonical.ts",
    role: "canonical",
    summary: "Canonical JSON serialization and SHA-256 digests via node:crypto.",
  },
  {
    path: "src/contract.ts",
    role: "contract",
    summary:
      "Contract name, revision, typed laws, contract assertion; re-exports the public entries.",
  },
  {
    path: "src/contract-entries.ts",
    role: "manifest",
    summary: "Public contract entry manifest (PUBLIC_CONTRACT), split out of contract.ts.",
  },
  {
    path: "src/validate.ts",
    role: "validate",
    summary: "Shared primitive validators: kebab ids, hex digests, ISO timestamps, plain objects.",
  },
  {
    path: "src/types/format.ts",
    role: "types",
    summary:
      "Format capability matrix types: FormatId, feature support, fidelity class, descriptor.",
  },
  {
    path: "src/types/manifest.ts",
    role: "types",
    summary:
      "Import manifest types: source identity, normalized records, provenance links, target.",
  },
  {
    path: "src/types/fidelity.ts",
    role: "types",
    summary: "Fidelity declaration and typed gate rejection types.",
  },
  {
    path: "src/types/normalization.ts",
    role: "types",
    summary: "Normalization machine result, summary and validation failure types.",
  },
  { path: "src/types/limitations.ts", role: "types", summary: "Honest limitations report types." },
  {
    path: "src/build/formats.ts",
    role: "machine",
    summary: "Assimp-documented format capability matrix data and descriptor builder.",
  },
  {
    path: "src/build/fidelity.ts",
    role: "machine",
    summary: "Deterministic fidelity gate machine with typed rejections.",
  },
  {
    path: "src/build/manifest.ts",
    role: "machine",
    summary: "Import manifest normalization machine with digest provenance.",
  },
  {
    path: "src/build/summarize.ts",
    role: "machine",
    summary: "Deterministic import summary with per-kind record counts.",
  },
  {
    path: "src/build/validate.ts",
    role: "machine",
    summary: "Normalized asset validation with typed failures.",
  },
  {
    path: "src/build/limitations.ts",
    role: "machine",
    summary: "Honest limitations report builder.",
  },
  {
    path: "src/module.ts",
    role: "manifest",
    summary: "Module name and artifact manifest with digest.",
  },
  {
    path: "src/index.ts",
    role: "barrel",
    summary: "Public barrel exporting exactly the contract runtime names.",
  },
];

export const moduleManifestDigest: HexDigest = sha256Canonical(MODULE_ARTIFACTS);
