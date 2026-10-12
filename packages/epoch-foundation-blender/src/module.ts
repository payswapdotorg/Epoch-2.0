import { sha256Canonical } from "./canonical.js";
import type { Digest } from "./types/brands.js";

export const MODULE_NAME = "epoch-foundation-blender";

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
  {
    path: "src/canonical.ts",
    role: "canonical",
    summary: "canonicalJson and sha256 helpers over node:crypto.",
  },
  {
    path: "src/contract.ts",
    role: "contract",
    summary: "public contract surface, laws, and assertion.",
  },
  {
    path: "src/validate.ts",
    role: "validate",
    summary: "shared guards and checked constructors for branded primitives.",
  },
  { path: "src/types/brands.ts", role: "types", summary: "branded primitive ids and digests." },
  { path: "src/types/formats.ts", role: "types", summary: "format class and catalog entry types." },
  { path: "src/types/descriptor.ts", role: "types", summary: "native tool descriptor types." },
  {
    path: "src/types/invocation.ts",
    role: "types",
    summary: "invocation contract and plan types.",
  },
  { path: "src/types/license.ts", role: "types", summary: "license and provenance record types." },
  { path: "src/types/exchange.ts", role: "types", summary: "geometry exchange record types." },
  { path: "src/types/limitations.ts", role: "types", summary: "limitations report types." },
  { path: "src/types/matrix.ts", role: "types", summary: "capability matrix summary types." },
  {
    path: "src/types/validation.ts",
    role: "types",
    summary: "registry and typed rejection unions.",
  },
  { path: "src/build/formats.ts", role: "machine", summary: "neutral format catalog and lookups." },
  {
    path: "src/build/descriptor.ts",
    role: "machine",
    summary: "Blender and FreeCAD descriptor builders.",
  },
  {
    path: "src/build/invocation.ts",
    role: "machine",
    summary: "invocation contract and plan builders.",
  },
  { path: "src/build/license.ts", role: "machine", summary: "license and provenance builders." },
  {
    path: "src/build/exchange.ts",
    role: "machine",
    summary: "exchange record builders and presets.",
  },
  {
    path: "src/build/exchange-validation.ts",
    role: "machine",
    summary: "typed validation machine for exchange records.",
  },
  {
    path: "src/build/plan-validation.ts",
    role: "machine",
    summary: "typed validation machine for invocation plans.",
  },
  {
    path: "src/build/limitations.ts",
    role: "machine",
    summary: "honest limitations catalog and report builder.",
  },
  {
    path: "src/build/matrix.ts",
    role: "machine",
    summary: "deterministic capability matrix summarizer.",
  },
  { path: "src/module.ts", role: "manifest", summary: "module artifact manifest and digest." },
  {
    path: "src/index.ts",
    role: "barrel",
    summary: "public barrel re-exporting the contract surface.",
  },
];

export const MODULE_MANIFEST_DIGEST: Digest = sha256Canonical(MODULE_ARTIFACTS);
