import {
  isBoolean,
  isDigest,
  isKebabId,
  isNonEmptyString,
  isNonEmptyStringArray,
  isSemver,
} from "../validate.js";
import { formatCatalogEntry, knownFormatIds } from "./formats.js";
import { exportableFormats, importableFormats } from "./descriptor.js";
import { FIDELITY_FLAG_NAMES, SEMANTIC_AUTHORITY_KINDS, exchangeRecordDigest } from "./exchange.js";
import type {
  ExchangeRejection,
  ExchangeValidation,
  RejectedExchangeRecord,
} from "../types/validation.js";
import type { GeometryExchangeRecord } from "../types/exchange.js";

function rejectedExchange(reason: ExchangeRejection): RejectedExchangeRecord {
  return { kind: "exchange-rejected", reason };
}

function isExchangeDirection(value: unknown): value is "import" | "export" {
  return value === "import" || value === "export";
}

function checkExchangeSyntax(
  record: GeometryExchangeRecord,
): { field: string; reason: string } | null {
  if (typeof record !== "object" || record === null) {
    return { field: "record", reason: "not an object" };
  }
  if (record.kind !== "geometry-exchange-record") {
    return { field: "kind", reason: "unexpected record kind" };
  }
  if (!isKebabId(record.exchangeId)) {
    return { field: "exchangeId", reason: "not a kebab id" };
  }
  if (!isKebabId(record.toolId)) {
    return { field: "toolId", reason: "not a kebab id" };
  }
  if (!isSemver(record.toolVersion)) {
    return { field: "toolVersion", reason: "not a semver" };
  }
  if (!isExchangeDirection(record.direction)) {
    return { field: "direction", reason: "must be import or export" };
  }
  if (!isKebabId(record.formatId)) {
    return { field: "formatId", reason: "not a kebab id" };
  }
  if (!isNonEmptyString(record.fileExtension) || !record.fileExtension.startsWith(".")) {
    return { field: "fileExtension", reason: "must be a non-empty extension starting with a dot" };
  }
  if (typeof record.fidelity !== "object" || record.fidelity === null) {
    return { field: "fidelity", reason: "fidelity flags must be an object" };
  }
  const fidelity = record.fidelity as unknown as Record<string, unknown>;
  for (const flagName of FIDELITY_FLAG_NAMES) {
    if (!isBoolean(fidelity[flagName])) {
      return { field: "fidelity", reason: `flag "${flagName}" must be a boolean` };
    }
  }
  if (!Array.isArray(record.semanticAuthorityRefs)) {
    return { field: "semanticAuthorityRefs", reason: "must be an array" };
  }
  for (const ref of record.semanticAuthorityRefs) {
    if (typeof ref !== "object" || ref === null) {
      return { field: "semanticAuthorityRefs", reason: "each reference must be an object" };
    }
    if (!SEMANTIC_AUTHORITY_KINDS.includes(ref.authorityKind)) {
      return { field: "semanticAuthorityRefs", reason: "unknown authority kind" };
    }
    if (!isKebabId(ref.authorityId)) {
      return { field: "semanticAuthorityRefs", reason: "authorityId is not a kebab id" };
    }
    if (!isNonEmptyString(ref.authorityPackage)) {
      return {
        field: "semanticAuthorityRefs",
        reason: "authorityPackage must be a non-empty string",
      };
    }
    if (!isNonEmptyString(ref.workOrderRef)) {
      return { field: "semanticAuthorityRefs", reason: "workOrderRef must be a non-empty string" };
    }
    if (!isDigest(ref.recordDigest)) {
      return { field: "semanticAuthorityRefs", reason: "recordDigest is not a 64-char hex digest" };
    }
    if (!isNonEmptyString(ref.relationship)) {
      return { field: "semanticAuthorityRefs", reason: "relationship must be a non-empty string" };
    }
  }
  if (!isNonEmptyString(record.toolSupport)) {
    return { field: "toolSupport", reason: "must be a non-empty string" };
  }
  if (!isNonEmptyStringArray(record.knownLimitations)) {
    return { field: "knownLimitations", reason: "must be non-empty strings" };
  }
  if (!isNonEmptyStringArray(record.honestyNotes)) {
    return { field: "honestyNotes", reason: "must be non-empty strings" };
  }
  return null;
}

export function validateExchangeRecord(
  record: GeometryExchangeRecord,
  registry: Parameters<typeof importExchangeRegistry>[0] extends never
    ? never
    : ExchangeValidationRegistry,
): ExchangeValidation {
  return importExchangeRegistry(record, registry);
}

type ExchangeValidationRegistry = import("../types/validation.js").CapabilityRegistry;

function importExchangeRegistry(
  record: GeometryExchangeRecord,
  registry: ExchangeValidationRegistry,
): ExchangeValidation {
  const syntaxProblem = checkExchangeSyntax(record);
  if (syntaxProblem !== null) {
    return rejectedExchange({
      kind: "malformed-record",
      field: syntaxProblem.field,
      reason: syntaxProblem.reason,
    });
  }
  const catalogEntry = formatCatalogEntry(record.formatId);
  if (catalogEntry === null) {
    return rejectedExchange({
      kind: "unknown-format",
      formatId: record.formatId,
      knownFormatIds: knownFormatIds(),
    });
  }
  const descriptor = registry.descriptors.find((candidate) => candidate.toolId === record.toolId);
  if (descriptor === undefined) {
    return rejectedExchange({
      kind: "unknown-tool",
      toolId: record.toolId,
      knownToolIds: registry.descriptors.map((candidate) => candidate.toolId),
    });
  }
  if (descriptor.toolVersion !== record.toolVersion) {
    return rejectedExchange({
      kind: "tool-version-mismatch",
      toolId: record.toolId,
      expectedVersion: descriptor.toolVersion,
      recordVersion: record.toolVersion,
    });
  }
  const supported =
    record.direction === "import" ? importableFormats(descriptor) : exportableFormats(descriptor);
  if (!supported.includes(record.formatId)) {
    return rejectedExchange({
      kind: "format-not-supported-for-direction",
      formatId: record.formatId,
      direction: record.direction,
      toolId: record.toolId,
      supportedFormats: [...supported],
    });
  }
  if (!catalogEntry.extensions.includes(record.fileExtension)) {
    return rejectedExchange({
      kind: "extension-mismatch",
      fileExtension: record.fileExtension,
      expectedExtensions: [...catalogEntry.extensions],
    });
  }
  if (record.fidelity.brepGeometry && !catalogEntry.carriesBRep) {
    return rejectedExchange({
      kind: "fidelity-claim-unsupported",
      flag: "brepGeometry",
      formatClass: catalogEntry.formatClass,
      formatId: record.formatId,
    });
  }
  if (record.semanticAuthorityRefs.length === 0) {
    return rejectedExchange({ kind: "missing-semantic-authority" });
  }
  if (
    record.fidelity.brepGeometry &&
    !record.semanticAuthorityRefs.some((ref) => ref.authorityKind === "geometry-kernel")
  ) {
    return rejectedExchange({
      kind: "brep-authority-required",
      requiredAuthorityKind: "geometry-kernel",
    });
  }
  return { kind: "exchange-valid", recordDigest: exchangeRecordDigest(record) };
}

export function formatExchangeRejection(rejection: ExchangeRejection): string {
  switch (rejection.kind) {
    case "malformed-record":
      return `malformed exchange record: field "${rejection.field}" — ${rejection.reason}`;
    case "unknown-tool":
      return `unknown tool "${rejection.toolId}"; known tools: [${rejection.knownToolIds.join(", ")}]`;
    case "tool-version-mismatch":
      return `tool "${rejection.toolId}" pinned to ${rejection.expectedVersion}, record says ${rejection.recordVersion}`;
    case "unknown-format":
      return `unknown format "${rejection.formatId}"; known: [${rejection.knownFormatIds.join(", ")}]`;
    case "format-not-supported-for-direction":
      return `tool "${rejection.toolId}" does not support ${rejection.direction} of "${rejection.formatId}"; supported: [${rejection.supportedFormats.join(", ")}]`;
    case "extension-mismatch":
      return `extension "${rejection.fileExtension}" does not match ${rejection.expectedExtensions.join(" | ")}`;
    case "fidelity-claim-unsupported":
      return `format "${rejection.formatId}" (class ${rejection.formatClass}) cannot carry ${rejection.flag} fidelity`;
    case "missing-semantic-authority":
      return `exchange record has no semantic authority references`;
    case "brep-authority-required":
      return `brepGeometry fidelity requires a ${rejection.requiredAuthorityKind} authority reference`;
    default: {
      const exhausted: never = rejection;
      throw new Error(`unhandled exchange rejection kind: ${JSON.stringify(exhausted)}`);
    }
  }
}
