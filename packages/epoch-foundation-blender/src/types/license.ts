import type { Digest, KebabId, LicenseId, Semver, ToolId, UtcTimestamp } from "./brands.js";

export type CopyleftKind = "strong-copyleft" | "weak-copyleft" | "permissive";

export interface LicenseRecord {
  readonly kind: "license-record";
  readonly licenseId: LicenseId;
  readonly spdxIdentifier: string;
  readonly displayName: string;
  readonly toolId: ToolId;
  readonly toolVersion: Semver;
  readonly copyleft: CopyleftKind;
  readonly distributionImplications: readonly string[];
  readonly processBoundaryNotes: readonly string[];
  readonly referenceUrls: readonly string[];
  readonly notLegalAdvice: true;
  readonly honestyNotes: readonly string[];
}

export type ProvenanceArtifactRole =
  | "geometry-exchange-record"
  | "intermediate-artifact"
  | "stdout-log"
  | "stderr-log";

export interface ProvenanceArtifact {
  readonly role: ProvenanceArtifactRole;
  readonly digest: Digest;
  readonly label: string;
}

export interface ProvenanceRecord {
  readonly kind: "provenance-record";
  readonly provenanceId: KebabId;
  readonly toolId: ToolId;
  readonly toolVersion: Semver;
  readonly toolDescriptorDigest: Digest;
  readonly invocationContractDigest: Digest;
  readonly invocationPlanDigest: Digest;
  readonly producedArtifacts: readonly ProvenanceArtifact[];
  readonly recordedAtUtc: UtcTimestamp;
  readonly environmentNotes: readonly string[];
  readonly honestyNotes: readonly string[];
}

export interface ProvenanceInput {
  readonly provenanceId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly toolDescriptorDigest: string;
  readonly invocationContractDigest: string;
  readonly invocationPlanDigest: string;
  readonly producedArtifacts: readonly {
    readonly role: ProvenanceArtifactRole;
    readonly digest: string;
    readonly label: string;
  }[];
  readonly recordedAtUtc: string;
  readonly environmentNotes?: readonly string[];
}
