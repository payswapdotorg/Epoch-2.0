export { canonicalJson, sha256Hex, canonicalDigest } from "./canonical.js";
export type { CanonicalJsonValue } from "./canonical.js";

export {
  CONTRACT_NAME,
  CONTRACT_REVISION,
  CONTRACT_LAWS,
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "./contract.js";
export type { ContractEntryKind, ContractLaw, PublicContractEntry } from "./contract.js";

export {
  isDigestHex,
  isDigestRef,
  isFiniteNumber,
  isKebabId,
  isMemberOf,
  isNonEmptyString,
  isNonEmptyStringArray,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
} from "./validate.js";

export {
  RESULT_FIELD_ASSOCIATIONS,
  RESULT_FIELD_DATA_TYPES,
  RESULT_FIELD_ENCODINGS,
} from "./types/dataset.js";
export type {
  DigestRef,
  QuantityUnit,
  ResultDataset,
  ResultDatasetRejection,
  ResultDatasetValidation,
  ResultField,
  ResultFieldAssociation,
  ResultFieldDataType,
  ResultFieldEncoding,
  TimeStepRef,
  ValueRange,
} from "./types/dataset.js";

export type { Sha256Hex } from "./types/branded.js";

export { LIMITATION_AREAS } from "./types/limitations.js";
export type {
  LimitationArea,
  LimitationStatement,
  LimitationsReport,
} from "./types/limitations.js";

export {
  PARAVIEW_COLOR_MAPS,
  PARAVIEW_FILTER_KINDS,
  PARAVIEW_REPRESENTATIONS,
} from "./types/paraview.js";
export type {
  ClipFilter,
  ColorMapAssignment,
  ContourFilter,
  GlyphFilter,
  ParaViewColorMapName,
  ParaViewFilter,
  ParaViewFilterKind,
  ParaViewPluginRef,
  ParaViewPluginRefParams,
  ParaViewPluginRefRejection,
  ParaViewPluginRefValidation,
  ParaViewRepresentation,
  ParaViewStateDescriptor,
  ParaViewStateRejection,
  ParaViewStateValidation,
  SliceFilter,
  StreamlineFilter,
  ThresholdFilter,
  Vector3,
} from "./types/paraview.js";

export { PROJECTION_DERIVATION_KINDS } from "./types/projection.js";
export type {
  DerivationKindCount,
  ProjectionCoverageSummary,
  ProjectionDerivation,
  ProjectionDerivationKind,
  ResultProjectionInput,
  ResultProjectionRecord,
  ResultProjectionRejection,
  ResultProjectionValidation,
} from "./types/projection.js";

export {
  buildLimitationsReport,
  limitationAreaTitle,
  limitationsReportDigest,
} from "./build/limitations.js";

export { resultDatasetDigest, validateResultDataset } from "./build/dataset.js";

export {
  buildParaViewPluginRef,
  paraViewPluginRefDigest,
  validateParaViewPluginRef,
} from "./build/plugin-ref.js";

export {
  paraViewStateDescriptorDigest,
  validateStateDescriptor,
} from "./build/state-descriptor.js";

export {
  buildResultProjectionRecord,
  resultProjectionRecordDigest,
  summarizeProjectionCoverage,
  validateResultProjectionRecord,
} from "./build/projection.js";

export { MODULE_ARTIFACTS, MODULE_NAME, moduleManifestDigest } from "./module.js";
export type { ModuleArtifact, ModuleRole } from "./module.js";
