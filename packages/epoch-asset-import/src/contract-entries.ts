// The declared public surface as data, split out of contract.ts under the
// max-contract-lines law. Declares its own entry types and imports nothing:
// the dependency is strictly one-directional (contract.ts -> contract-entries.ts).

export type PublicContractEntryKind = "type" | "function" | "const";

export type PublicContractEntry = {
  readonly name: string;
  readonly kind: PublicContractEntryKind;
  readonly summary: string;
};

export const PUBLIC_CONTRACT: readonly PublicContractEntry[] = [
  {
    name: "CanonicalPrimitive",
    kind: "type",
    summary: "JSON primitive allowed in canonical payloads (string, number, boolean, null).",
  },
  {
    name: "CanonicalValue",
    kind: "type",
    summary: "Recursively canonicalizable JSON value (sorted-key objects, readonly arrays).",
  },
  { name: "HexDigest", kind: "type", summary: "Branded lowercase 64-char SHA-256 hex digest." },
  {
    name: "canonicalJson",
    kind: "function",
    summary: "Deterministic JSON serialization: recursively sorted keys, no whitespace.",
  },
  {
    name: "sha256Hex",
    kind: "function",
    summary: "SHA-256 of a UTF-8 string as lowercase hex, via node:crypto.",
  },
  {
    name: "sha256Canonical",
    kind: "function",
    summary: "SHA-256 over the canonical JSON form of a value.",
  },
  { name: "ContractLaw", kind: "type", summary: "A named law statement of this contract." },
  {
    name: "PublicContractEntryKind",
    kind: "type",
    summary: "Kind of a public contract entry: type, function or const.",
  },
  {
    name: "PublicContractEntry",
    kind: "type",
    summary: "A public contract entry (name, kind, summary).",
  },
  { name: "CONTRACT_NAME", kind: "const", summary: "Contract name: epoch-asset-import." },
  { name: "CONTRACT_REVISION", kind: "const", summary: "Contract revision number." },
  { name: "CONTRACT_LAWS", kind: "const", summary: "The typed laws governing this package." },
  {
    name: "PUBLIC_CONTRACT",
    kind: "const",
    summary: "The declared public surface (types, functions, consts).",
  },
  {
    name: "assertPublicContract",
    kind: "function",
    summary: "Asserts a runtime export list equals the declared runtime contract.",
  },
  {
    name: "publicContractNames",
    kind: "function",
    summary: "All declared public names (types included).",
  },
  {
    name: "runtimeContractNames",
    kind: "function",
    summary: "Declared runtime names only (functions and consts).",
  },
  { name: "kebabId", kind: "function", summary: "Guard: non-empty kebab-case identifier." },
  { name: "nonEmptyString", kind: "function", summary: "Guard: non-empty string." },
  { name: "nonNegativeInteger", kind: "function", summary: "Guard: integer >= 0." },
  { name: "positiveInteger", kind: "function", summary: "Guard: integer > 0." },
  { name: "isHexString64", kind: "function", summary: "Guard: 64 lowercase hex chars." },
  { name: "isPlainObject", kind: "function", summary: "Guard: non-null, non-array object." },
  {
    name: "isIso8601Utc",
    kind: "function",
    summary: "Guard: ISO-8601 UTC timestamp string ending in Z.",
  },
  { name: "FormatId", kind: "type", summary: "Branded kebab format identifier (e.g. gltf2)." },
  {
    name: "FidelityClass",
    kind: "type",
    summary: "Fidelity tier: full-fidelity | meshes-materials | meshes-only.",
  },
  {
    name: "FormatFeatureSupport",
    kind: "type",
    summary: "Boolean feature support: meshes, materials, skeletons, animations, pbr.",
  },
  {
    name: "ImportFormatDescriptor",
    kind: "type",
    summary: "One Assimp-documented format: id, extensions, features, fidelity class, notes.",
  },
  {
    name: "SourceDigest",
    kind: "type",
    summary: "Alias of HexDigest for source asset identity digests.",
  },
  {
    name: "RecordDigest",
    kind: "type",
    summary: "Alias of HexDigest for normalized record digests.",
  },
  {
    name: "SourceAssetIdentity",
    kind: "type",
    summary: "Source asset identity: digest, format id, byte size.",
  },
  {
    name: "SourceAssetIdentityInput",
    kind: "type",
    summary: "Unvalidated input form of the source identity.",
  },
  {
    name: "NormalizedRecordKind",
    kind: "type",
    summary: "mesh | material | skeleton | animation | scene-graph | texture | metadata.",
  },
  {
    name: "NormalizedRecord",
    kind: "type",
    summary: "Normalized record with digest and canonical payload.",
  },
  {
    name: "ProvenanceLink",
    kind: "type",
    summary: "Source digest to record digest provenance link.",
  },
  {
    name: "TargetRepresentation",
    kind: "type",
    summary: "Declared target representation (normalized-records) with declared kinds.",
  },
  {
    name: "ImportManifest",
    kind: "type",
    summary: "Complete import manifest with provenance chain.",
  },
  {
    name: "NORMALIZED_RECORD_KINDS",
    kind: "const",
    summary: "Exhaustive list of normalized record kinds.",
  },
  {
    name: "FidelityDeclaration",
    kind: "type",
    summary: "Declared preservation of meshes, materials, skeletons, animations, PBR.",
  },
  {
    name: "FidelityRejectionKind",
    kind: "type",
    summary: "Typed rejection kinds: the four loss classes plus undeclared-fidelity.",
  },
  {
    name: "FidelityRejectionReason",
    kind: "type",
    summary: "Typed rejection reason (kind + detail).",
  },
  {
    name: "FidelityGateDecision",
    kind: "type",
    summary: "Accepted (with declaration) or rejected (with typed reason).",
  },
  {
    name: "FidelityGateInput",
    kind: "type",
    summary: "Gate input: format descriptor plus declaration or null.",
  },
  {
    name: "NormalizeRecordInput",
    kind: "type",
    summary: "Record input: id, kind, canonical payload.",
  },
  {
    name: "NormalizeImportManifestInput",
    kind: "type",
    summary: "Full normalization input; timestamps are inputs, never generated.",
  },
  {
    name: "NormalizeFailure",
    kind: "type",
    summary: "Typed normalization failure (kind + detail).",
  },
  {
    name: "NormalizeFailureKind",
    kind: "type",
    summary: "unknown-format | invalid-input | fidelity-gate-rejected.",
  },
  {
    name: "NormalizeImportManifestResult",
    kind: "type",
    summary: "Ok (manifest + manifest digest) or rejected (typed failure).",
  },
  {
    name: "ImportSummary",
    kind: "type",
    summary: "Deterministic import summary with per-kind record counts.",
  },
  {
    name: "ValidationFailure",
    kind: "type",
    summary: "Typed validation failure with optional record id.",
  },
  {
    name: "ValidationFailureKind",
    kind: "type",
    summary:
      "invalid-digest | digest-mismatch | orphan-record | duplicate-record-id | provenance-source-mismatch | undeclared-record-kind.",
  },
  {
    name: "ValidateNormalizedAssetResult",
    kind: "type",
    summary: "Valid or invalid with typed failure list.",
  },
  {
    name: "LimitationScope",
    kind: "type",
    summary: "runtime | format-matrix | archives | provenance | contract.",
  },
  { name: "LimitationItem", kind: "type", summary: "One honest limitation (id, scope, summary)." },
  { name: "LimitationsReport", kind: "type", summary: "Honest limitations report (honest: true)." },
  {
    name: "FORMAT_MATRIX",
    kind: "const",
    summary: "Assimp-documented format capability matrix as data.",
  },
  {
    name: "getFormatDescriptor",
    kind: "function",
    summary: "Look up a format descriptor by id (null when unknown).",
  },
  { name: "listFormatIds", kind: "function", summary: "Sorted list of known format ids." },
  {
    name: "importFormatDescriptor",
    kind: "function",
    summary: "Validate and build a format descriptor (throws on invalid input).",
  },
  {
    name: "ImportFormatDescriptorInput",
    kind: "type",
    summary: "Input form for importFormatDescriptor (fidelity class as plain string).",
  },
  {
    name: "applyFidelityGate",
    kind: "function",
    summary: "Deterministic fidelity gate: accept or reject with typed reason.",
  },
  {
    name: "describeFidelityRejection",
    kind: "function",
    summary: "Human-readable rendering of a typed rejection (exhaustive switch).",
  },
  {
    name: "normalizeImportManifest",
    kind: "function",
    summary: "Deterministic normalization machine producing a provenance-linked manifest.",
  },
  {
    name: "summarizeImport",
    kind: "function",
    summary: "Deterministic summary of a normalized manifest.",
  },
  {
    name: "validateNormalizedAsset",
    kind: "function",
    summary: "Typed validation: digest matches, no orphans, no duplicates.",
  },
  {
    name: "buildLimitationsReport",
    kind: "function",
    summary: "Builds the honest limitations report.",
  },
  { name: "LIMITATIONS", kind: "const", summary: "The honest limitations report instance." },
  {
    name: "ModuleArtifactRole",
    kind: "type",
    summary: "canonical | contract | validate | types | machine | manifest | barrel.",
  },
  { name: "ModuleArtifact", kind: "type", summary: "One src artifact: path, role, summary." },
  { name: "MODULE_NAME", kind: "const", summary: "Module name: epoch-asset-import." },
  {
    name: "MODULE_ARTIFACTS",
    kind: "const",
    summary: "Manifest of every src file with role and summary.",
  },
  {
    name: "moduleManifestDigest",
    kind: "const",
    summary: "SHA-256 digest over the canonical module artifact manifest.",
  },
];
