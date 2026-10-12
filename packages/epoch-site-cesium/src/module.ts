import { digestJson } from "./canonical.js";

export const MODULE_NAME = "@zcode/epoch-site-cesium" as const;

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
    summary: "Canonical JSON (sorted keys, no whitespace) and SHA-256 digest helpers.",
  },
  {
    path: "src/contract.ts",
    role: "contract",
    summary: "Contract name/revision/laws and the PUBLIC_CONTRACT runtime-name list.",
  },
  {
    path: "src/validate.ts",
    role: "validate",
    summary: "Shared value validators: kebab ids, digests, timestamps, numbers.",
  },
  {
    path: "src/types/site.ts",
    role: "types",
    summary: "SiteModel, CRS/anchor/extents, terrain and imagery refs, site entities.",
  },
  {
    path: "src/types/placement.ts",
    role: "types",
    summary: "WorldEntityRef (by digest), LocalFrame, SitePlacement, ECEF/ENU/local points.",
  },
  {
    path: "src/types/projection.ts",
    role: "types",
    summary: "SiteProjectionRecord read model, context snapshot, summary, build inputs.",
  },
  {
    path: "src/types/validation.ts",
    role: "types",
    summary: "Discriminated typed rejections for site, placement and projection machines.",
  },
  {
    path: "src/types/limitations.ts",
    role: "types",
    summary: "LimitationsReport typed data and the SITE_LIMITATIONS artifact.",
  },
  {
    path: "src/build/coordinate.ts",
    role: "machine",
    summary: "Deterministic WGS84 machines: geodeticToEcef, enuToEcef, localToEnu.",
  },
  {
    path: "src/build/site.ts",
    role: "machine",
    summary: "buildSiteModel and digestSiteModel.",
  },
  {
    path: "src/build/placement.ts",
    role: "machine",
    summary: "computePlacement, transformLocalPoint, validatePlacement.",
  },
  {
    path: "src/build/validate.ts",
    role: "machine",
    summary: "validateSiteModel with typed rejections.",
  },
  {
    path: "src/build/projection.ts",
    role: "machine",
    summary: "buildSiteProjectionRecord and summarizeSiteProjection.",
  },
  {
    path: "src/module.ts",
    role: "manifest",
    summary: "This manifest: module name, artifacts and the manifest digest.",
  },
  {
    path: "src/index.ts",
    role: "barrel",
    summary: "Public barrel exporting exactly the contract's runtime names.",
  },
];

export const MODULE_MANIFEST_DIGEST: string = digestJson({
  moduleName: MODULE_NAME,
  artifacts: MODULE_ARTIFACTS,
});
