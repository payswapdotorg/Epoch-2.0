import { sha256Canonical } from "../canonical.js";
import {
  toDigest,
  toKebabId,
  toLicenseId,
  toNonEmptyString,
  toSemver,
  toToolId,
  toUtcTimestamp,
} from "../validate.js";
import type { Digest, LicenseId } from "../types/brands.js";
import type {
  LicenseRecord,
  ProvenanceArtifactRole,
  ProvenanceInput,
  ProvenanceRecord,
} from "../types/license.js";

export const BLENDER_LICENSE_ID: LicenseId = toLicenseId("gpl-3.0-or-later");
export const FREECAD_LICENSE_ID: LicenseId = toLicenseId("lgpl-2.1-or-later");

const PROVENANCE_ARTIFACT_ROLES: readonly ProvenanceArtifactRole[] = [
  "geometry-exchange-record",
  "intermediate-artifact",
  "stdout-log",
  "stderr-log",
];

export function buildBlenderLicenseRecord(input: { readonly toolVersion: string }): LicenseRecord {
  return {
    kind: "license-record",
    licenseId: BLENDER_LICENSE_ID,
    spdxIdentifier: "GPL-3.0-or-later",
    displayName: "GNU General Public License v3.0 or later",
    toolId: toToolId("blender-bpy-headless"),
    toolVersion: toSemver(input.toolVersion),
    copyleft: "strong-copyleft",
    distributionImplications: [
      "distributing Blender binaries requires offering the corresponding source under GPL-3.0-or-later",
      "linking Blender's bpy module into a distributed application generally subjects the combined work to GPL-3.0",
      "files produced by running Blender (meshes, renders, exports) are not restricted by Blender's license",
    ],
    processBoundaryNotes: [
      "invoking Blender as a separate operating-system process — the boundary this package describes — keeps host and tool separate programs",
      "merging host code and Blender into one distributed process changes the analysis; consult counsel before distributing",
    ],
    referenceUrls: [
      "https://www.blender.org/about/license/",
      "https://www.gnu.org/licenses/gpl-3.0.html",
    ],
    notLegalAdvice: true,
    honestyNotes: [
      "license is recorded per tool version; Blender's license has changed across major releases, so verify per version",
      "this record is an engineering summary, not legal advice",
    ],
  };
}

export function buildFreecadLicenseRecord(input: { readonly toolVersion: string }): LicenseRecord {
  return {
    kind: "license-record",
    licenseId: FREECAD_LICENSE_ID,
    spdxIdentifier: "LGPL-2.1-or-later",
    displayName: "GNU Lesser General Public License v2.1 or later",
    toolId: toToolId("freecad-console"),
    toolVersion: toSemver(input.toolVersion),
    copyleft: "weak-copyleft",
    distributionImplications: [
      "distributing unmodified FreeCAD binaries requires offering the corresponding source under LGPL-2.1-or-later",
      "LGPL generally permits linking from other code provided relinking stays possible and library obligations are met",
      "files produced by running FreeCAD (STEP, BRep, meshes) are not restricted by FreeCAD's license",
    ],
    processBoundaryNotes: [
      "separate-process invocation as described here avoids linking obligations entirely",
    ],
    referenceUrls: [
      "https://wiki.freecad.org/Licence",
      "https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html",
    ],
    notLegalAdvice: true,
    honestyNotes: [
      "bundled components (the OCCT kernel, import/export libraries, IfcOpenShell) carry their own licenses; this record covers the FreeCAD application only",
      "this record is an engineering summary, not legal advice",
    ],
  };
}

export function licenseRecordDigest(record: LicenseRecord): Digest {
  return sha256Canonical(record);
}

export function buildProvenanceRecord(input: ProvenanceInput): ProvenanceRecord {
  if (input.producedArtifacts.length === 0) {
    throw new Error("provenance records require at least one produced artifact");
  }
  return {
    kind: "provenance-record",
    provenanceId: toKebabId(input.provenanceId),
    toolId: toToolId(input.toolId),
    toolVersion: toSemver(input.toolVersion),
    toolDescriptorDigest: toDigest(input.toolDescriptorDigest),
    invocationContractDigest: toDigest(input.invocationContractDigest),
    invocationPlanDigest: toDigest(input.invocationPlanDigest),
    producedArtifacts: input.producedArtifacts.map((artifact) => {
      if (!PROVENANCE_ARTIFACT_ROLES.includes(artifact.role)) {
        throw new Error(`unknown provenance artifact role: ${JSON.stringify(artifact.role)}`);
      }
      return {
        role: artifact.role,
        digest: toDigest(artifact.digest),
        label: toNonEmptyString(artifact.label),
      };
    }),
    recordedAtUtc: toUtcTimestamp(input.recordedAtUtc),
    environmentNotes: (input.environmentNotes ?? []).map((note) => toNonEmptyString(note)),
    honestyNotes: [
      "recorded by the host after execution; this package cannot verify that the execution actually happened",
      "artifact digests are computed by the host over artifact bytes or canonical records",
    ],
  };
}

export function provenanceRecordDigest(record: ProvenanceRecord): Digest {
  return sha256Canonical(record);
}
