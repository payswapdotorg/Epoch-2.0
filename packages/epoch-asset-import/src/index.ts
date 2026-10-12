// canonical
export { canonicalJson, sha256Hex, sha256Canonical } from "./canonical.js";
export type { CanonicalPrimitive, CanonicalValue, HexDigest } from "./canonical.js";
// contract
export {
  CONTRACT_NAME,
  CONTRACT_REVISION,
  CONTRACT_LAWS,
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "./contract.js";
export type { ContractLaw, PublicContractEntry, PublicContractEntryKind } from "./contract.js";
// validate
export {
  isHexString64,
  isIso8601Utc,
  isPlainObject,
  kebabId,
  nonEmptyString,
  nonNegativeInteger,
  positiveInteger,
} from "./validate.js";
// types
export type {
  FidelityClass,
  FormatFeatureSupport,
  FormatId,
  ImportFormatDescriptor,
} from "./types/format.js";
export { NORMALIZED_RECORD_KINDS } from "./types/manifest.js";
export type {
  ImportManifest,
  NormalizedRecord,
  NormalizedRecordKind,
  ProvenanceLink,
  RecordDigest,
  SourceAssetIdentity,
  SourceAssetIdentityInput,
  SourceDigest,
  TargetRepresentation,
} from "./types/manifest.js";
export type {
  FidelityDeclaration,
  FidelityGateDecision,
  FidelityGateInput,
  FidelityRejectionKind,
  FidelityRejectionReason,
} from "./types/fidelity.js";
export type {
  ImportSummary,
  NormalizeFailure,
  NormalizeFailureKind,
  NormalizeImportManifestInput,
  NormalizeImportManifestResult,
  NormalizeRecordInput,
  ValidateNormalizedAssetResult,
  ValidationFailure,
  ValidationFailureKind,
} from "./types/normalization.js";
export type { LimitationItem, LimitationsReport, LimitationScope } from "./types/limitations.js";
// machines
export {
  FORMAT_MATRIX,
  getFormatDescriptor,
  importFormatDescriptor,
  listFormatIds,
} from "./build/formats.js";
export type { ImportFormatDescriptorInput } from "./build/formats.js";
export { applyFidelityGate, describeFidelityRejection } from "./build/fidelity.js";
export { normalizeImportManifest } from "./build/manifest.js";
export { summarizeImport } from "./build/summarize.js";
export { validateNormalizedAsset } from "./build/validate.js";
export { buildLimitationsReport, LIMITATIONS } from "./build/limitations.js";
// module
export { MODULE_ARTIFACTS, MODULE_NAME, moduleManifestDigest } from "./module.js";
export type { ModuleArtifact, ModuleArtifactRole } from "./module.js";
