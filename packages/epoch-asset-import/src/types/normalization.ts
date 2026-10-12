import type { CanonicalValue, HexDigest } from "../canonical.js";
import type { FidelityClass } from "./format.js";
import type { FidelityDeclaration } from "./fidelity.js";
import type { ImportManifest, NormalizedRecordKind, SourceAssetIdentityInput } from "./manifest.js";

export type NormalizeRecordInput = {
  readonly recordId: string;
  readonly kind: NormalizedRecordKind;
  readonly payload: CanonicalValue;
};

export type NormalizeImportManifestInput = {
  readonly manifestId: string;
  readonly source: SourceAssetIdentityInput;
  readonly targetKinds: readonly NormalizedRecordKind[];
  readonly declaration: FidelityDeclaration | null;
  readonly records: readonly NormalizeRecordInput[];
  readonly generatedAt: string;
};

export type NormalizeFailureKind = "unknown-format" | "invalid-input" | "fidelity-gate-rejected";

export type NormalizeFailure = {
  readonly kind: NormalizeFailureKind;
  readonly detail: string;
};

export type NormalizeImportManifestResult =
  | { readonly status: "ok"; readonly manifest: ImportManifest; readonly manifestDigest: HexDigest }
  | { readonly status: "rejected"; readonly failure: NormalizeFailure };

export type ImportSummary = {
  readonly manifestId: string;
  readonly formatId: string;
  readonly fidelityClass: FidelityClass;
  readonly sourceDigest: string;
  readonly sourceByteSize: number;
  readonly totalRecords: number;
  readonly provenanceLinks: number;
  readonly recordCounts: Readonly<Record<NormalizedRecordKind, number>>;
};

export type ValidationFailureKind =
  | "invalid-digest"
  | "digest-mismatch"
  | "orphan-record"
  | "duplicate-record-id"
  | "provenance-source-mismatch"
  | "undeclared-record-kind";

export type ValidationFailure = {
  readonly kind: ValidationFailureKind;
  readonly detail: string;
  readonly recordId?: string;
};

export type ValidateNormalizedAssetResult =
  | { readonly status: "valid" }
  | { readonly status: "invalid"; readonly failures: readonly ValidationFailure[] };
