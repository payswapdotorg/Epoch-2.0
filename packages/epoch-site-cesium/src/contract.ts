/**
 * Public contract of @zcode/epoch-site-cesium.
 *
 * PUBLIC_CONTRACT lists every RUNTIME name that the public barrel
 * (src/index.ts) must export — exactly those names, no more, no less.
 * Type-only exports ride along in the barrel for compile-time consumers
 * and are deliberately not runtime names.
 */

export const CONTRACT_NAME = "epoch-site-cesium" as const;
export const CONTRACT_REVISION = 1 as const;

export interface ContractLaw {
  readonly lawId: string;
  readonly statement: string;
}

export const CONTRACT_LAWS: readonly ContractLaw[] = [
  {
    lawId: "projection-not-authority",
    statement: "Optional geospatial projection of the world model.",
  },
  {
    lawId: "world-model-owns-semantics",
    statement: "Engineering semantics live in the world model only.",
  },
  {
    lawId: "no-second-authority",
    statement: "Site context is never a second semantic authority.",
  },
  {
    lawId: "placement-is-derived",
    statement: "Placements are derived from inputs, never mutated.",
  },
  {
    lawId: "explicit-axis-conventions",
    statement: "Local x is East, y is North, z is Up (right-handed).",
  },
  {
    lawId: "typed-rejections",
    statement: "Typed, discriminated rejections from every machine.",
  },
  {
    lawId: "no-runtime-no-network",
    statement: "No Cesium runtime, network, filesystem writes, processes.",
  },
  {
    lawId: "declared-datum-pairs-only",
    statement: "Only declared WGS84 EPSG pairs; no datum shifts.",
  },
  {
    lawId: "timestamps-are-inputs",
    statement: "Machines never read the clock; timestamps are inputs.",
  },
  {
    lawId: "digest-addressing",
    statement: "Artifacts are addressed by SHA-256 over canonical JSON.",
  },
];

export type PublicContractKind = "const" | "function" | "machine";

export interface PublicContractEntry {
  readonly name: string;
  readonly kind: PublicContractKind;
  readonly summary: string;
}

export const PUBLIC_CONTRACT: readonly PublicContractEntry[] = [
  {
    name: "canonicalJson",
    kind: "function",
    summary: "Canonical JSON: sorted keys, no whitespace.",
  },
  {
    name: "sha256Hex",
    kind: "function",
    summary: "SHA-256 of a UTF-8 string as lowercase hex.",
  },
  {
    name: "digestJson",
    kind: "function",
    summary: "SHA-256 digest over the canonical JSON form of a value.",
  },
  {
    name: "CONTRACT_NAME",
    kind: "const",
    summary: "Contract name string.",
  },
  {
    name: "CONTRACT_REVISION",
    kind: "const",
    summary: "Contract revision number.",
  },
  {
    name: "CONTRACT_LAWS",
    kind: "const",
    summary: "Typed laws governing this package.",
  },
  {
    name: "PUBLIC_CONTRACT",
    kind: "const",
    summary: "Runtime names of the public surface.",
  },
  {
    name: "publicContractNames",
    kind: "function",
    summary: "Sorted runtime names from PUBLIC_CONTRACT.",
  },
  {
    name: "runtimeContractNames",
    kind: "function",
    summary: "Sorted runtime export names of a module.",
  },
  {
    name: "assertPublicContract",
    kind: "function",
    summary: "Asserts barrel names match the contract.",
  },
  {
    name: "SUPPORTED_EPSG_CODES",
    kind: "const",
    summary: "Declared WGS84-based EPSG pairs (4326, 4979).",
  },
  {
    name: "SITE_PLACEMENT_ALGORITHM",
    kind: "const",
    summary: "Versioned id of the placement algorithm.",
  },
  {
    name: "SITE_LIMITATIONS",
    kind: "const",
    summary: "Honest LimitationsReport artifact.",
  },
  {
    name: "WGS84_SEMI_MAJOR_AXIS",
    kind: "const",
    summary: "WGS84 semi-major axis in meters.",
  },
  {
    name: "WGS84_FIRST_ECCENTRICITY_SQUARED",
    kind: "const",
    summary: "WGS84 first eccentricity squared.",
  },
  {
    name: "geodeticToEcef",
    kind: "machine",
    summary: "WGS84 geodetic anchor to an ECEF point.",
  },
  {
    name: "enuToEcef",
    kind: "machine",
    summary: "ENU offset at an anchor to an ECEF point.",
  },
  {
    name: "localToEnu",
    kind: "machine",
    summary: "Local frame vector to ENU under heading.",
  },
  {
    name: "buildSiteModel",
    kind: "machine",
    summary: "Validates input and builds a SiteModel.",
  },
  {
    name: "digestSiteModel",
    kind: "function",
    summary: "Content digest of a SiteModel.",
  },
  {
    name: "computePlacement",
    kind: "machine",
    summary: "Deterministic local-to-ECEF-anchor placement.",
  },
  {
    name: "transformLocalPoint",
    kind: "machine",
    summary: "Local point through the placement chain.",
  },
  {
    name: "validatePlacement",
    kind: "machine",
    summary: "Re-derives and checks a SitePlacement.",
  },
  {
    name: "validateSiteModel",
    kind: "machine",
    summary: "Checks SiteModel invariants, typed rejections.",
  },
  {
    name: "buildSiteProjectionRecord",
    kind: "machine",
    summary: "Builds the read-model projection snapshot.",
  },
  {
    name: "summarizeSiteProjection",
    kind: "machine",
    summary: "Recomputes a projection record summary.",
  },
  {
    name: "MODULE_NAME",
    kind: "const",
    summary: "Module name string.",
  },
  {
    name: "MODULE_ARTIFACTS",
    kind: "const",
    summary: "Manifest of module artifacts and roles.",
  },
  {
    name: "MODULE_MANIFEST_DIGEST",
    kind: "const",
    summary: "Digest over the module artifact manifest.",
  },
];

export function publicContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.map((entry) => entry.name).sort();
}

export function runtimeContractNames(
  moduleExports: Readonly<Record<string, unknown>>,
): readonly string[] {
  return Object.keys(moduleExports).sort();
}

export function assertPublicContract(runtimeNames: readonly string[]): void {
  const declared = PUBLIC_CONTRACT.map((entry) => entry.name);
  if (new Set(declared).size !== declared.length) {
    throw new Error("assertPublicContract: PUBLIC_CONTRACT contains duplicate names");
  }
  for (const entry of PUBLIC_CONTRACT) {
    if (entry.name.length === 0 || entry.summary.length === 0) {
      throw new Error(
        `assertPublicContract: entry has an empty name or summary: ${JSON.stringify(entry)}`,
      );
    }
  }
  const expected = publicContractNames();
  const actual = [...new Set(runtimeNames)].sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `assertPublicContract: public barrel mismatch (missing: [${missing.join(", ")}], extra: [${extra.join(", ")}])`,
    );
  }
}
