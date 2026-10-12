import type { CanonicalValue, HexDigest } from "../canonical.js";
import type { FidelityClass, FormatId } from "./format.js";

export type SourceDigest = HexDigest;
export type RecordDigest = HexDigest;

export type SourceAssetIdentity = {
  readonly digest: SourceDigest;
  readonly formatId: FormatId;
  readonly byteSize: number;
};

export type SourceAssetIdentityInput = {
  readonly digest: string;
  readonly formatId: string;
  readonly byteSize: number;
};

export type NormalizedRecordKind =
  | "mesh"
  | "material"
  | "skeleton"
  | "animation"
  | "scene-graph"
  | "texture"
  | "metadata";

export const NORMALIZED_RECORD_KINDS: readonly NormalizedRecordKind[] = [
  "mesh",
  "material",
  "skeleton",
  "animation",
  "scene-graph",
  "texture",
  "metadata",
];

export type NormalizedRecord = {
  readonly recordId: string;
  readonly kind: NormalizedRecordKind;
  readonly digest: RecordDigest;
  readonly payload: CanonicalValue;
};

export type ProvenanceLink = {
  readonly sourceDigest: SourceDigest;
  readonly recordId: string;
  readonly recordKind: NormalizedRecordKind;
  readonly recordDigest: RecordDigest;
};

export type TargetRepresentation = {
  readonly kind: "normalized-records";
  readonly declaredKinds: readonly NormalizedRecordKind[];
};

export type ImportManifest = {
  readonly manifestId: string;
  readonly contractRevision: number;
  readonly fidelityClass: FidelityClass;
  readonly source: SourceAssetIdentity;
  readonly target: TargetRepresentation;
  readonly records: readonly NormalizedRecord[];
  readonly provenance: readonly ProvenanceLink[];
  readonly generatedAt: string;
};
