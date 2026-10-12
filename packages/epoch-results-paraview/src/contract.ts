export const CONTRACT_NAME = "epoch-results-paraview";
export const CONTRACT_REVISION = 1;

export interface ContractLaw {
  readonly id: string;
  readonly statement: string;
}

export const CONTRACT_LAWS: readonly ContractLaw[] = [
  {
    id: "projection-read-model",
    statement:
      "Result datasets and ParaView state descriptors are projection read-models: typed data plus deterministic machines, never execution authority.",
  },
  {
    id: "no-silent-replacement",
    statement:
      "A result projection record binds a dataset digest to a world-model entity digest with a declared derivation; results never silently replace baseline world state.",
  },
  {
    id: "digest-references",
    statement:
      "Meshes, topologies, world entities and payloads are referenced by owner package and sha256 digest; owning packages are never re-defined or imported here.",
  },
  {
    id: "no-paraview-runtime",
    statement:
      "No ParaView or VTK runtime is embedded or spawned; state descriptors are provider-neutral data that a host may feed to ParaView.",
  },
  {
    id: "typed-rejections",
    statement:
      "Every validation machine returns typed discriminated rejections; domain failures never throw.",
  },
  {
    id: "deterministic-machines",
    statement:
      "Machines are pure: no wall-clock, no randomness, no filesystem or network access; timestamps are inputs; digests are lowercase sha256 hex over canonical JSON.",
  },
  {
    id: "honest-limitations",
    statement:
      "External capability limitations are recorded honestly in a LimitationsReport artifact and the README.",
  },
  {
    id: "no-cross-package-imports",
    statement:
      "Sibling package semantics are referenced by typed data and digest refs only, never by imports across their seams.",
  },
];

export type ContractEntryKind = "type" | "function" | "const";

export interface PublicContractEntry {
  readonly name: string;
  readonly kind: ContractEntryKind;
  readonly summary: string;
}

export const PUBLIC_CONTRACT: readonly PublicContractEntry[] = [
  {
    name: "canonicalJson",
    kind: "function",
    summary: "canonical JSON (sorted keys, no whitespace)",
  },
  { name: "sha256Hex", kind: "function", summary: "sha256 hex digest of a string" },
  { name: "canonicalDigest", kind: "function", summary: "sha256 over canonical JSON" },
  { name: "CONTRACT_NAME", kind: "const", summary: "contract name" },
  { name: "CONTRACT_REVISION", kind: "const", summary: "contract revision" },
  { name: "CONTRACT_LAWS", kind: "const", summary: "typed package laws" },
  { name: "PUBLIC_CONTRACT", kind: "const", summary: "public contract entries" },
  { name: "assertPublicContract", kind: "function", summary: "assert barrel matches the contract" },
  { name: "publicContractNames", kind: "function", summary: "all contract entry names" },
  { name: "runtimeContractNames", kind: "function", summary: "runtime contract entry names" },
  { name: "isRecord", kind: "function", summary: "unknown is a plain record" },
  { name: "isNonEmptyString", kind: "function", summary: "non-empty string check" },
  { name: "isNonEmptyStringArray", kind: "function", summary: "array of non-empty strings" },
  { name: "isNonNegativeInteger", kind: "function", summary: "non-negative integer check" },
  { name: "isPositiveInteger", kind: "function", summary: "positive integer check" },
  { name: "isFiniteNumber", kind: "function", summary: "finite number check" },
  { name: "isKebabId", kind: "function", summary: "kebab-id check" },
  { name: "isDigestHex", kind: "function", summary: "64-char lowercase hex check" },
  { name: "isMemberOf", kind: "function", summary: "membership type guard" },
  { name: "isDigestRef", kind: "function", summary: "digest reference type guard" },
  { name: "RESULT_FIELD_ASSOCIATIONS", kind: "const", summary: "point/cell associations" },
  { name: "RESULT_FIELD_ENCODINGS", kind: "const", summary: "inline/external encodings" },
  { name: "RESULT_FIELD_DATA_TYPES", kind: "const", summary: "allowed field data types" },
  { name: "PARAVIEW_COLOR_MAPS", kind: "const", summary: "supported color map names" },
  { name: "PARAVIEW_REPRESENTATIONS", kind: "const", summary: "supported representations" },
  { name: "PARAVIEW_FILTER_KINDS", kind: "const", summary: "supported filter kinds" },
  { name: "PROJECTION_DERIVATION_KINDS", kind: "const", summary: "declared derivation kinds" },
  { name: "LIMITATION_AREAS", kind: "const", summary: "limitation area names" },
  { name: "validateResultDataset", kind: "function", summary: "validate a result dataset" },
  { name: "resultDatasetDigest", kind: "function", summary: "digest of a result dataset" },
  { name: "validateStateDescriptor", kind: "function", summary: "validate a state descriptor" },
  {
    name: "paraViewStateDescriptorDigest",
    kind: "function",
    summary: "digest of a state descriptor",
  },
  { name: "validateParaViewPluginRef", kind: "function", summary: "validate a plugin ref" },
  { name: "buildParaViewPluginRef", kind: "function", summary: "build a plugin ref" },
  { name: "paraViewPluginRefDigest", kind: "function", summary: "digest of a plugin ref" },
  { name: "buildResultProjectionRecord", kind: "function", summary: "build a projection record" },
  {
    name: "validateResultProjectionRecord",
    kind: "function",
    summary: "validate a projection record",
  },
  {
    name: "resultProjectionRecordDigest",
    kind: "function",
    summary: "digest of a projection record",
  },
  {
    name: "summarizeProjectionCoverage",
    kind: "function",
    summary: "deterministic coverage summary",
  },
  { name: "buildLimitationsReport", kind: "function", summary: "honest limitations report" },
  { name: "limitationsReportDigest", kind: "function", summary: "digest of a limitations report" },
  { name: "limitationAreaTitle", kind: "function", summary: "display title for an area" },
  { name: "MODULE_NAME", kind: "const", summary: "module name" },
  { name: "MODULE_ARTIFACTS", kind: "const", summary: "src artifact manifest" },
  { name: "moduleManifestDigest", kind: "function", summary: "digest of the manifest" },
  { name: "CanonicalJsonValue", kind: "type", summary: "canonical JSON value" },
  { name: "Sha256Hex", kind: "type", summary: "branded sha256 hex digest" },
  { name: "ResultFieldAssociation", kind: "type", summary: "point or cell" },
  { name: "ResultFieldEncoding", kind: "type", summary: "inline or external" },
  { name: "ResultFieldDataType", kind: "type", summary: "field data type" },
  { name: "ValueRange", kind: "type", summary: "min/max range" },
  { name: "QuantityUnit", kind: "type", summary: "quantity to units binding" },
  { name: "DigestRef", kind: "type", summary: "owner package + digest ref" },
  { name: "TimeStepRef", kind: "type", summary: "time step reference" },
  { name: "ResultField", kind: "type", summary: "typed result field" },
  { name: "ResultDataset", kind: "type", summary: "result dataset read-model" },
  { name: "ResultDatasetRejection", kind: "type", summary: "typed dataset rejections" },
  { name: "ResultDatasetValidation", kind: "type", summary: "dataset validation result" },
  { name: "ParaViewColorMapName", kind: "type", summary: "color map name" },
  { name: "ParaViewRepresentation", kind: "type", summary: "representation name" },
  { name: "ParaViewFilterKind", kind: "type", summary: "filter kind" },
  { name: "Vector3", kind: "type", summary: "3-vector tuple" },
  { name: "ColorMapAssignment", kind: "type", summary: "color map assignment" },
  { name: "SliceFilter", kind: "type", summary: "slice filter" },
  { name: "ClipFilter", kind: "type", summary: "clip filter" },
  { name: "GlyphFilter", kind: "type", summary: "glyph filter" },
  { name: "StreamlineFilter", kind: "type", summary: "streamline filter" },
  { name: "ContourFilter", kind: "type", summary: "contour filter" },
  { name: "ThresholdFilter", kind: "type", summary: "threshold filter" },
  { name: "ParaViewFilter", kind: "type", summary: "filter union" },
  { name: "ParaViewPluginRef", kind: "type", summary: "plugin provenance ref" },
  { name: "ParaViewPluginRefParams", kind: "type", summary: "plugin ref builder params" },
  { name: "ParaViewPluginRefRejection", kind: "type", summary: "typed plugin rejections" },
  { name: "ParaViewPluginRefValidation", kind: "type", summary: "plugin validation result" },
  { name: "ParaViewStateDescriptor", kind: "type", summary: "state descriptor read-model" },
  { name: "ParaViewStateRejection", kind: "type", summary: "typed state rejections" },
  { name: "ParaViewStateValidation", kind: "type", summary: "state validation result" },
  { name: "ProjectionDerivationKind", kind: "type", summary: "derivation kind" },
  { name: "ProjectionDerivation", kind: "type", summary: "declared derivation" },
  { name: "ResultProjectionRecord", kind: "type", summary: "projection binding record" },
  { name: "ResultProjectionInput", kind: "type", summary: "record builder params" },
  { name: "ResultProjectionRejection", kind: "type", summary: "typed projection rejections" },
  { name: "ResultProjectionValidation", kind: "type", summary: "projection validation result" },
  { name: "DerivationKindCount", kind: "type", summary: "derivation count pair" },
  { name: "ProjectionCoverageSummary", kind: "type", summary: "coverage summary" },
  { name: "LimitationArea", kind: "type", summary: "limitation area" },
  { name: "LimitationStatement", kind: "type", summary: "limitation statement" },
  { name: "LimitationsReport", kind: "type", summary: "limitations report" },
  { name: "ContractLaw", kind: "type", summary: "typed law" },
  { name: "ContractEntryKind", kind: "type", summary: "contract entry kind" },
  { name: "PublicContractEntry", kind: "type", summary: "contract entry" },
  { name: "ModuleRole", kind: "type", summary: "artifact role" },
  { name: "ModuleArtifact", kind: "type", summary: "manifest artifact" },
];

/** All contract entry names (types and runtime), sorted. */
export function publicContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.map((entry) => entry.name).sort();
}

/** Runtime (non-type) contract entry names, sorted. */
export function runtimeContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.filter((entry) => entry.kind !== "type")
    .map((entry) => entry.name)
    .sort();
}

/** Assert that a module namespace exports exactly the contract runtime names. */
export function assertPublicContract(moduleExports: Readonly<Record<string, unknown>>): void {
  const expected = runtimeContractNames();
  const actual = Object.keys(moduleExports).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `public contract mismatch for ${CONTRACT_NAME}: missing [${missing.join(
        ", ",
      )}], unexpected [${unexpected.join(", ")}]`,
    );
  }
}
