// Adapter: W023 discovery-spine declarations -> lab inputs.
// The frozen W023 contract is consumed at its public entrypoint (type-only import).
// Field access is defensive (structural, widened to unknown) so this file is the ONLY
// place that can break if W023 field shapes evolve; callers get typed outcomes.

import type { CapabilityEvidence, DiscoveredCapability } from "@zcode/epoch-capability-discovery";
import type { DiscoveryAdapterOutcome, EvidenceRef, QualificationStatus } from "./contract.js";
import { isSha256Digest } from "./digest.js";
import { metricIdsForClass } from "./catalog.js";
import { QUALIFICATION_STATUSES } from "./qualification.js";

const QUALIFICATION_STATUS_SET: ReadonlySet<string> = new Set<string>(QUALIFICATION_STATUSES);

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function nonEmptyString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readStatus(record: UnknownRecord): QualificationStatus {
  const value = record["qualificationStatus"] ?? record["status"];
  return typeof value === "string" && QUALIFICATION_STATUS_SET.has(value) ? (value as QualificationStatus) : "prototype";
}

function evidenceDigests(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const digests: string[] = [];
  for (const entry of value) {
    const digest = asRecord(entry)["digest"];
    if (typeof digest === "string" && isSha256Digest(digest)) {
      digests.push(digest);
    }
  }
  return digests;
}

/**
 * Builds a capability-under-test declaration from a W023 discovered capability.
 * Discovery declarations carry evidence digests but NO metric measurements:
 * measurement bundles must be supplied by the caller (the lab never executes capabilities).
 */
export function fromDiscoveredCapability(discovered: DiscoveredCapability, capturedAtEpoch: number): DiscoveryAdapterOutcome {
  const record = asRecord(discovered);
  const capabilityId = nonEmptyString(record, "capabilityId") ?? nonEmptyString(record, "id");
  const capabilityClass = nonEmptyString(record, "capabilityClass") ?? nonEmptyString(record, "class");
  if (capabilityId === null || capabilityClass === null) {
    return {
      ok: false,
      error: {
        code: "adapter/insufficient-declaration",
        detail: "discovered capability lacks a usable capabilityId/capabilityClass",
      },
    };
  }
  if (metricIdsForClass(capabilityClass) === null) {
    return {
      ok: false,
      error: {
        code: "adapter/unknown-capability-class",
        detail: `capability class ${capabilityClass} is not in the metric registry`,
      },
    };
  }
  const version = nonEmptyString(record, "version") ?? "0";
  const evidence: EvidenceRef[] = evidenceDigests(record["evidence"]).map((digest) => ({
    digest,
    source: "discovery-evidence",
    capturedAtEpoch,
  }));
  return {
    ok: true,
    capability: {
      kind: "capability-under-test",
      capabilityId,
      capabilityClass,
      version,
      currentStatus: readStatus(record),
      measurements: [],
      evidence,
      knownLimits: [],
    },
  };
}

/** Extracts well-formed evidence references from W023 capability evidence declarations. */
export function evidenceRefsFromDiscovered(evidences: readonly CapabilityEvidence[], capturedAtEpoch: number): EvidenceRef[] {
  return evidences
    .map((entry) => asRecord(entry)["digest"])
    .filter((digest): digest is string => typeof digest === "string" && isSha256Digest(digest))
    .map((digest) => ({ digest, source: "discovery-evidence", capturedAtEpoch }));
}
