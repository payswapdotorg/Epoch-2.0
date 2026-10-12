import type { Digest, FormatId, KebabId, NonEmptyString, Semver, ToolId } from "./brands.js";

export type ExchangeDirection = "import" | "export";

export interface FormatFidelityFlags {
  readonly meshGeometry: boolean;
  readonly brepGeometry: boolean;
  readonly materials: boolean;
  readonly textures: boolean;
  readonly normals: boolean;
  readonly uvCoordinates: boolean;
  readonly animations: boolean;
  readonly instancing: boolean;
  readonly sceneHierarchy: boolean;
  readonly unitsAndScaling: boolean;
  readonly metadata: boolean;
  readonly overallLossy: boolean;
}

export type SemanticAuthorityKind = "geometry-kernel" | "world-model" | "format-schema";

/**
 * Opaque reference to a semantic authority owned by a sibling package
 * (OCCT W011, world model W000, IFC/glTF/OpenUSD schema owners). The digest
 * is computed by that package's own canonical form; this package never
 * recomputes or re-defines it.
 */
export interface SemanticAuthorityRef {
  readonly authorityKind: SemanticAuthorityKind;
  readonly authorityId: KebabId;
  readonly authorityPackage: NonEmptyString;
  readonly workOrderRef: NonEmptyString;
  readonly recordDigest: Digest;
  readonly relationship: NonEmptyString;
}

export interface GeometryExchangeRecord {
  readonly kind: "geometry-exchange-record";
  readonly exchangeId: KebabId;
  readonly toolId: ToolId;
  readonly toolVersion: Semver;
  readonly direction: ExchangeDirection;
  readonly formatId: FormatId;
  readonly fileExtension: string;
  readonly fidelity: FormatFidelityFlags;
  readonly semanticAuthorityRefs: readonly SemanticAuthorityRef[];
  readonly toolSupport: string;
  readonly knownLimitations: readonly string[];
  readonly honestyNotes: readonly string[];
}

export interface GeometryExchangeInput {
  readonly exchangeId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly direction: ExchangeDirection;
  readonly formatId: string;
  readonly fileExtension: string;
  readonly fidelity: FormatFidelityFlags;
  readonly semanticAuthorityRefs: readonly {
    readonly authorityKind: SemanticAuthorityKind;
    readonly authorityId: string;
    readonly authorityPackage: string;
    readonly workOrderRef: string;
    readonly recordDigest: string;
    readonly relationship: string;
  }[];
  readonly toolSupport: string;
  readonly knownLimitations?: readonly string[];
}
