import type { KebabId } from "./types/shared.js";

export const CONTRACT_NAME = "epoch-engineering-projections";
export const CONTRACT_REVISION = 1;

export interface ContractLaw {
  readonly lawId: KebabId;
  readonly statement: string;
}

export type ContractEntryKind = "type" | "const" | "function" | "machine";

export interface ContractEntry {
  readonly name: string;
  readonly kind: ContractEntryKind;
  readonly summary: string;
}

const law = (lawId: string, statement: string): ContractLaw => ({
  lawId: lawId as KebabId,
  statement,
});
const entry = (name: string, kind: ContractEntryKind, summary: string): ContractEntry => ({
  name,
  kind,
  summary,
});

export const CONTRACT_LAWS: readonly ContractLaw[] = [
  law(
    "world-model-identity-authority",
    "Entity identity is the world-model digest; entity records are never re-defined here and are referenced by digest only.",
  ),
  law(
    "derived-projections-only",
    "Inspector views, takeoffs, BOQ documents, constraints and findings are derived projections with no execution authority.",
  ),
  law(
    "explicit-takeoff-methods",
    "Quantity takeoff methods are explicit typed data carrying a declared measurement basis; methods are never implied.",
  ),
  law(
    "digest-links-no-duplicate-ledger",
    "Forward links live inside records; reverse indexes are derived on demand and never persisted as a second ledger.",
  ),
  law(
    "external-pricing-only",
    "No pricing data in-package; cost references point to external price sources by digest and rollups are exact single-currency sums.",
  ),
  law(
    "deterministic-machines",
    "Every machine is pure and deterministic; timestamps are inputs and are never generated.",
  ),
  law(
    "honest-limitations",
    "Pricing, scheduling and code-compliance checking are out of scope and are recorded honestly in the LimitationsReport and README.",
  ),
];

export const PUBLIC_CONTRACT: readonly ContractEntry[] = [
  entry("canonicalJson", "function", "canonical key-sorted compact JSON"),
  entry("sha256Hex", "function", "sha-256 lowercase-hex digest via node:crypto"),
  entry("sha256Json", "function", "digest of the canonical JSON form"),
  entry("CONTRACT_NAME", "const", "contract name"),
  entry("CONTRACT_REVISION", "const", "contract revision"),
  entry("CONTRACT_LAWS", "const", "typed contract laws"),
  entry("assertPublicContract", "function", "asserts a namespace matches the runtime contract"),
  entry("publicContractNames", "function", "all contract entry names, sorted"),
  entry("runtimeContractNames", "function", "runtime contract names, sorted"),
  entry("isNonEmptyString", "function", "guard: non-empty string"),
  entry("isKebabId", "function", "guard: kebab-case id"),
  entry("isNonNegativeInteger", "function", "guard: integer >= 0"),
  entry("isIso8601", "function", "guard: ISO-8601 timestamp"),
  entry("isDigest", "function", "guard: 64-char lowercase hex digest"),
  entry("isCurrencyCode", "function", "guard: three-letter currency code"),
  entry("isMeasureKind", "function", "guard: declared measure kind"),
  entry("isUnitOfMeasure", "function", "guard: declared unit of measure"),
  entry("isFindingSeverity", "function", "guard: declared finding severity"),
  entry("isFindingStatus", "function", "guard: declared finding status"),
  entry("MEASURE_KINDS", "const", "measure kinds as data"),
  entry("UNITS_OF_MEASURE", "const", "canonical units as data"),
  entry("UNIT_FOR_MEASURE_KIND", "const", "law: canonical unit per measure kind"),
  entry("TAKEOFF_METHOD_MEASURE_KIND", "const", "law: measure kind per takeoff method"),
  entry("FINDING_SEVERITIES", "const", "finding severities as data"),
  entry("FINDING_STATUSES", "const", "finding statuses as data"),
  entry("FINDING_STATUS_TRANSITIONS", "const", "law: finding status lifecycle as data"),
  entry("deriveInspectorView", "machine", "derives the per-entity inspector read-model"),
  entry("buildQuantityTakeoff", "machine", "builds a takeoff with explicit method and basis"),
  entry("compileBoq", "machine", "compiles a BOQ document under typed laws"),
  entry("buildConstraint", "machine", "builds a constraint bound to an entity digest"),
  entry("validateConstraints", "machine", "typed verdicts against takeoff records"),
  entry("buildFinding", "machine", "builds an inspection finding record"),
  entry("advanceFindingStatus", "machine", "advances status along the data lifecycle"),
  entry("buildLinkIndex", "machine", "derives the entity link index"),
  entry("buildLimitationsReport", "machine", "builds the honest limitations report"),
  entry("MODULE_NAME", "const", "module name"),
  entry("MODULE_ARTIFACTS", "const", "per-source-file artifact manifest"),
  entry("moduleManifestDigest", "const", "digest over the module manifest"),
  entry("JsonValue", "type", "canonical JSON value shapes"),
  entry("Digest", "type", "branded sha-256 digest"),
  entry("EntityDigest", "type", "branded world-model entity digest"),
  entry("KebabId", "type", "branded kebab-case identifier"),
  entry("Iso8601", "type", "branded ISO-8601 timestamp"),
  entry("CurrencyCode", "type", "branded currency code"),
  entry("MoneyMinor", "type", "money in integer minor units"),
  entry("Result", "type", "ok/rejection result shape"),
  entry("MeasureKind", "type", "measure kind union"),
  entry("UnitOfMeasure", "type", "unit of measure union"),
  entry("Quantity", "type", "typed quantity with derived unit"),
  entry("TakeoffMethod", "type", "explicit takeoff method data"),
  entry("MeasurementBasis", "type", "measurement basis data"),
  entry("QuantityTakeoff", "type", "quantity takeoff record"),
  entry("InspectorView", "type", "per-entity inspection read-model"),
  entry("PropertyPanel", "type", "typed property panel"),
  entry("PropertyPanelField", "type", "typed panel field"),
  entry("MeasurementAnnotation", "type", "measurement annotation"),
  entry("CostReference", "type", "external price-source reference by digest"),
  entry("BoqLineItem", "type", "BOQ line item keyed by entity digest"),
  entry("BoqDocument", "type", "compiled BOQ document"),
  entry("BoqGroupingLaw", "type", "typed grouping law"),
  entry("BoqRollupLaw", "type", "typed rollup law"),
  entry("ConstraintRecord", "type", "constraint bound to an entity digest"),
  entry("ConstraintKind", "type", "typed constraint kinds"),
  entry("ConstraintVerdict", "type", "typed constraint verdict"),
  entry("FindingRecord", "type", "inspection finding record"),
  entry("FindingSeverity", "type", "finding severity union"),
  entry("FindingStatus", "type", "finding status union"),
  entry("LinkIndex", "type", "derived bidirectional link index"),
  entry("LimitationsReport", "type", "honest limitations report"),
  entry("ContractLaw", "type", "typed contract law"),
];

export function publicContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.map((contractEntry) => contractEntry.name).sort();
}

export function runtimeContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.filter((contractEntry) => contractEntry.kind !== "type")
    .map((contractEntry) => contractEntry.name)
    .sort();
}

export function assertPublicContract(moduleExports: object): void {
  const expected = runtimeContractNames();
  const actual = Object.keys(moduleExports).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${CONTRACT_NAME} contract revision ${CONTRACT_REVISION} violation: missing=[${missing.join(", ")}] unexpected=[${unexpected.join(", ")}]`,
    );
  }
}
