export const CONTRACT_NAME = "epoch-foundation-blender";
export const CONTRACT_REVISION = 1;

export type PublicContractKind = "constant" | "function" | "type";

export interface PublicContractEntry {
  readonly name: string;
  readonly kind: PublicContractKind;
  readonly summary: string;
}

export type ContractLawId =
  | "data-not-execution"
  | "host-owns-execution"
  | "no-second-geometry-authority"
  | "versioned-descriptor-pinning"
  | "honest-limitations"
  | "deterministic-machines"
  | "typed-rejections";

export interface ContractLaw {
  readonly lawId: ContractLawId;
  readonly statement: string;
}

export const CONTRACT_LAWS: readonly ContractLaw[] = [
  {
    lawId: "data-not-execution",
    statement:
      "This package describes and validates native-tool invocation as typed data; it never spawns processes, writes files, or opens sockets.",
  },
  {
    lawId: "host-owns-execution",
    statement:
      "The host decides whether and how to execute; this package only describes argv/stdin/capture contracts and validates plans against them.",
  },
  {
    lawId: "no-second-geometry-authority",
    statement:
      "Geometry semantics are owned by the OCCT package (W011) and the world model (W000); exchange records reference them by digest and never re-define them.",
  },
  {
    lawId: "versioned-descriptor-pinning",
    statement:
      "Blender and FreeCAD are separate NativeToolDescriptors pinned to one tool semver; licenses and invocation contracts bind to the same pin by digest.",
  },
  {
    lawId: "honest-limitations",
    statement:
      "Environment-dependent facts (binary availability, format fidelity, exit-code behavior) are recorded honestly in a LimitationsReport and are not guaranteed.",
  },
  {
    lawId: "deterministic-machines",
    statement:
      "Builders and validators are pure; timestamps are inputs, never generated; digests are SHA-256 over canonical JSON with recursively sorted keys.",
  },
  {
    lawId: "typed-rejections",
    statement:
      "Every validation failure is a discriminated-union rejection with machine-readable fields; domain failures are never thrown strings.",
  },
];

function entry(name: string, kind: PublicContractKind, summary: string): PublicContractEntry {
  return { name, kind, summary };
}

export const PUBLIC_CONTRACT: readonly PublicContractEntry[] = [
  entry("canonicalJson", "function", "Canonical JSON: recursively sorted keys, no whitespace."),
  entry("sha256Hex", "function", "SHA-256 of a string as lowercase hex via node:crypto."),
  entry("sha256Canonical", "function", "SHA-256 digest over the canonical JSON of a value."),
  entry("CONTRACT_NAME", "constant", "Contract name of this package."),
  entry("CONTRACT_REVISION", "constant", "Revision counter for the public contract."),
  entry("CONTRACT_LAWS", "constant", "Typed laws every consumer relies on."),
  entry("PUBLIC_CONTRACT", "constant", "Complete public surface (name/kind/summary)."),
  entry("assertPublicContract", "function", "Assert runtime exports match the contract."),
  entry("publicContractNames", "function", "All public names, runtime and type."),
  entry("runtimeContractNames", "function", "Public runtime (value) names only."),
  entry("isNonEmptyString", "function", "Guard: non-empty string."),
  entry("isNonEmptyStringArray", "function", "Guard: array of non-empty strings."),
  entry("isBoolean", "function", "Guard: boolean."),
  entry("isNonNegativeInteger", "function", "Guard: integer >= 0."),
  entry("isPositiveInteger", "function", "Guard: integer >= 1."),
  entry("isKebabId", "function", "Guard: lowercase kebab id."),
  entry("isSemver", "function", "Guard: semver x.y.z with optional pre/build."),
  entry("isDigest", "function", "Guard: 64-char lowercase hex digest."),
  entry("isIso8601Utc", "function", "Guard: ISO-8601 UTC timestamp string."),
  entry("toNonEmptyString", "function", "Checked constructor for NonEmptyString."),
  entry("toKebabId", "function", "Checked constructor for KebabId."),
  entry("toNonNegativeInteger", "function", "Checked constructor: integer >= 0."),
  entry("toPositiveInteger", "function", "Checked constructor: integer >= 1."),
  entry("toSemver", "function", "Checked constructor for Semver."),
  entry("toDigest", "function", "Checked constructor for Digest."),
  entry("toUtcTimestamp", "function", "Checked constructor for UtcTimestamp."),
  entry("toToolId", "function", "Checked constructor for ToolId (kebab)."),
  entry("toFormatId", "function", "Checked constructor for FormatId (kebab)."),
  entry("toLicenseId", "function", "Checked constructor for LicenseId (kebab)."),
  entry("compareStrings", "function", "Deterministic code-unit string comparison."),
  entry("sortedUnique", "function", "Sorted, de-duplicated string list."),
  entry("FORMAT_CATALOG", "constant", "Neutral format catalog: class, extensions, BRep carriage."),
  entry("knownFormatIds", "function", "Sorted known format ids."),
  entry("isKnownFormatId", "function", "Membership test against the catalog."),
  entry("formatCatalogEntry", "function", "Catalog lookup, null when unknown."),
  entry("BLENDER_TOOL_ID", "constant", "Tool id: blender-bpy-headless."),
  entry("FREECAD_TOOL_ID", "constant", "Tool id: freecad-console."),
  entry("buildBlenderToolDescriptor", "function", "Blender (bpy headless) descriptor pinned to a version."),
  entry("buildFreecadToolDescriptor", "function", "FreeCAD (console mode) descriptor pinned to a version."),
  entry("descriptorDigest", "function", "Digest over a tool descriptor."),
  entry("INVOCATION_PURPOSES", "constant", "Closed list of invocation purposes."),
  entry("buildBlenderInvocationContract", "function", "Blender argv/stdin/capture/timeout/sandbox contract."),
  entry("buildFreecadInvocationContract", "function", "FreeCAD console invocation contract."),
  entry("invocationContractDigest", "function", "Digest over an invocation contract."),
  entry("buildInvocationPlan", "function", "Validate and brand a host-authored plan."),
  entry("invocationPlanDigest", "function", "Digest over an invocation plan."),
  entry("resolveArgv", "function", "Resolve an argv template with bindings (data only)."),
  entry("BLENDER_LICENSE_ID", "constant", "License id: gpl-3.0-or-later."),
  entry("FREECAD_LICENSE_ID", "constant", "License id: lgpl-2.1-or-later."),
  entry("buildBlenderLicenseRecord", "function", "GPL-3.0+ record for a Blender version."),
  entry("buildFreecadLicenseRecord", "function", "LGPL-2.1+ record for a FreeCAD version."),
  entry("licenseRecordDigest", "function", "Digest over a license record."),
  entry("buildProvenanceRecord", "function", "Bind tool+version to produced artifacts by digest."),
  entry("provenanceRecordDigest", "function", "Digest over a provenance record."),
  entry("buildGeometryExchangeRecord", "function", "Validate and brand an exchange record."),
  entry("exchangeRecordDigest", "function", "Digest over an exchange record."),
  entry("presetBlenderObjExport", "function", "Curated Blender OBJ export exchange record."),
  entry("presetFreecadStepExport", "function", "Curated FreeCAD STEP export exchange record."),
  entry("validateInvocationPlan", "function", "Typed accept/reject machine for plans."),
  entry("validateExchangeRecord", "function", "Typed accept/reject machine for exchange records."),
  entry("formatInvocationRejection", "function", "Human-readable line for a plan rejection."),
  entry("formatExchangeRejection", "function", "Human-readable line for an exchange rejection."),
  entry("buildLimitationsReport", "function", "Honest limitations catalog report."),
  entry("limitationsReportDigest", "function", "Digest over a limitations report."),
  entry("summarizeCapabilityMatrix", "function", "Deterministic tool/format capability summary."),
  entry("MODULE_NAME", "constant", "Module name for manifest tooling."),
  entry("MODULE_ARTIFACTS", "constant", "Manifest of src artifacts with roles."),
  entry("MODULE_MANIFEST_DIGEST", "constant", "Digest over the module manifest."),
  entry("Brand", "type", "Nominal branding helper for primitive types."),
  entry("KebabId", "type", "Branded kebab-case identifier."),
  entry("NonEmptyString", "type", "Branded non-empty string."),
  entry("ToolId", "type", "Branded native tool identifier."),
  entry("Semver", "type", "Branded semver string."),
  entry("FormatId", "type", "Branded exchange format identifier."),
  entry("LicenseId", "type", "Branded license identifier."),
  entry("Digest", "type", "Branded 64-char lowercase hex digest."),
  entry("UtcTimestamp", "type", "Branded ISO-8601 UTC timestamp."),
  entry("FormatClass", "type", "Transport classification of a format (not geometry semantics)."),
  entry("FormatCatalogEntry", "type", "Neutral catalog entry: class, extensions, BRep carriage."),
  entry("NativeProcessKind", "type", "bpy-headless vs console-mode."),
  entry("ExitCodeRule", "type", "One exit code and its meaning."),
  entry("ExitCodeContract", "type", "Success code, failure rules, honesty notes."),
  entry("BinaryArgvShape", "type", "Binary name and argv contract shape summary."),
  entry("ToolFormatSupportDirection", "type", "import / export / both."),
  entry("ToolFormatSupport", "type", "Per-format support entry of a tool."),
  entry("NativeToolDescriptor", "type", "Versioned capability descriptor per adapter."),
  entry("ArgvToken", "type", "Literal or placeholder argv template token."),
  entry("ArgvBinding", "type", "Placeholder name plus supplied values."),
  entry("Stdin
