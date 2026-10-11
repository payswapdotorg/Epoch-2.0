import { canonicalJson, compareStrings, isHex64, sha256Hex } from "./canonical.js";
import {
  findDeploymentTarget,
  RELEASE_ARTIFACT_KINDS,
  type ReleaseArtifactKind,
} from "./deployment-targets.js";
import { recomputePlanDigest, type DeploymentPlan } from "./deployment-plan.js";

/**
 * Release manifest verification — cross-checks a PackageManifest against
 * a DeploymentPlan deterministically. This module never reads artifact
 * bytes: digests and sizes are owner-supplied data that the release
 * executor records when assembling artifacts; this adapter verifies
 * shape and cross-consistency only.
 */

export interface ArtifactDigest {
  readonly algorithm: "sha256";
  readonly hex: string;
}

export interface PackagedArtifact {
  readonly role: ReleaseArtifactKind;
  readonly path: string;
  readonly targetIds: readonly string[];
  readonly byteSize: number;
  readonly digest: ArtifactDigest;
}

export interface PackageManifest {
  readonly kind: "package-manifest";
  readonly version: string;
  readonly commit: string;
  readonly artifacts: readonly PackagedArtifact[];
  readonly manifestDigest: string;
}

export type ManifestConsistencyCode =
  | "manifest-kind-invalid"
  | "manifest-version-invalid"
  | "manifest-commit-invalid"
  | "manifest-digest-mismatch"
  | "plan-self-digest-mismatch"
  | "manifest-plan-version-mismatch"
  | "manifest-plan-commit-mismatch"
  | "artifact-role-invalid"
  | "artifact-path-empty"
  | "duplicate-artifact-path"
  | "artifact-target-empty"
  | "artifact-target-unknown"
  | "artifact-digest-malformed"
  | "artifact-size-invalid"
  | "missing-artifact-for-target"
  | "duplicate-artifact-target";

export interface ManifestConsistencyFinding {
  readonly code: ManifestConsistencyCode;
  readonly severity: "error" | "warning";
  readonly artifactPath: string | null;
  readonly targetId: string | null;
  readonly message: string;
}

export interface ManifestConsistencyReport {
  readonly kind: "manifest-consistency-report";
  readonly consistent: boolean;
  readonly artifactCount: number;
  readonly targetCount: number;
  readonly findings: readonly ManifestConsistencyFinding[];
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

export function verifyManifestConsistency(
  manifest: PackageManifest,
  plan: DeploymentPlan,
): ManifestConsistencyReport {
  const findings: ManifestConsistencyFinding[] = [];
  if ((manifest.kind as string) !== "package-manifest") {
    findings.push(
      finding("manifest-kind-invalid", "error", null, null, 'manifest kind must be "package-manifest"'),
    );
  }
  if (!SEMVER_PATTERN.test(manifest.version)) {
    findings.push(
      finding("manifest-version-invalid", "error", null, null, `manifest version ${manifest.version} is not semver`),
    );
  }
  if (!COMMIT_PATTERN.test(manifest.commit)) {
    findings.push(
      finding("manifest-commit-invalid", "error", null, null, "manifest commit is not 40 lowercase hex characters"),
    );
  }
  if (recomputeManifestDigest(manifest) !== manifest.manifestDigest) {
    findings.push(
      finding("manifest-digest-mismatch", "error", null, null, "manifest digest does not match its canonical content"),
    );
  }
  if (recomputePlanDigest(plan) !== plan.planDigest) {
    findings.push(
      finding("plan-self-digest-mismatch", "error", null, null, "plan digest does not match its canonical content"),
    );
  }
  if (manifest.version !== plan.version) {
    findings.push(
      finding(
        "manifest-plan-version-mismatch",
        "error",
        null,
        null,
        `manifest version ${manifest.version} does not match plan version ${plan.version}`,
      ),
    );
  }
  if (manifest.commit !== plan.commit) {
    findings.push(
      finding(
        "manifest-plan-commit-mismatch",
        "error",
        null,
        null,
        `manifest commit ${manifest.commit} does not match plan commit ${plan.commit}`,
      ),
    );
  }

  const planTargets = new Set(plan.targetIds);
  const seenPairs = new Set<string>();
  const seenPaths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (!RELEASE_ARTIFACT_KINDS.includes(artifact.role)) {
      findings.push(
        finding("artifact-role-invalid", "error", artifact.path, null, `unknown artifact role ${artifact.role}`),
      );
    }
    if (artifact.path === "") {
      findings.push(
        finding("artifact-path-empty", "error", artifact.path, null, "artifact path must not be empty"),
      );
    }
    if (seenPaths.has(artifact.path)) {
      findings.push(
        finding("duplicate-artifact-path", "error", artifact.path, null, `artifact path ${artifact.path} declared more than once`),
      );
    }
    seenPaths.add(artifact.path);
    if (artifact.targetIds.length === 0) {
      findings.push(
        finding("artifact-target-empty", "error", artifact.path, null, `artifact ${artifact.path} declares no targets`),
      );
    }
    for (const targetId of artifact.targetIds) {
      const pairKey = `${artifact.role}::${targetId}`;
      if (seenPairs.has(pairKey)) {
        findings.push(
          finding("duplicate-artifact-target", "error", artifact.path, targetId, `role ${artifact.role} for target ${targetId} declared more than once`),
        );
      }
      seenPairs.add(pairKey);
      if (!planTargets.has(targetId)) {
        findings.push(
          finding("artifact-target-unknown", "error", artifact.path, targetId, `artifact targets ${targetId} which is not in the deployment plan`),
        );
      }
    }
    if ((artifact.digest.algorithm as string) !== "sha256" || !isHex64(artifact.digest.hex)) {
      findings.push(
        finding("artifact-digest-malformed", "error", artifact.path, null, "artifact digest must be sha256 over 64 lowercase hex characters"),
      );
    }
    if (!Number.isInteger(artifact.byteSize) || artifact.byteSize < 0) {
      findings.push(
        finding("artifact-size-invalid", "error", artifact.path, null, "artifact byteSize must be a non-negative integer"),
      );
    } else if (artifact.byteSize === 0) {
      findings.push(
        finding("artifact-size-invalid", "warning", artifact.path, null, "artifact byteSize is zero — confirm this is intended"),
      );
    }
  }

  for (const targetId of plan.targetIds) {
    const target = findDeploymentTarget(targetId);
    if (target === undefined) {
      continue;
    }
    for (const role of target.requiredArtifacts) {
      const covered = manifest.artifacts.some(
        (artifact) => artifact.role === role && artifact.targetIds.includes(targetId),
      );
      if (!covered) {
        findings.push(
          finding("missing-artifact-for-target", "error", null, targetId, `target ${targetId} is missing a ${role} artifact`),
        );
      }
    }
  }

  findings.sort(compareFindings);
  const consistent = findings.every((item) => item.severity !== "error");
  return Object.freeze({
    kind: "manifest-consistency-report" as const,
    consistent,
    artifactCount: manifest.artifacts.length,
    targetCount: plan.targetIds.length,
    findings: Object.freeze(findings.map((item) => Object.freeze(item))),
  });
}

export function recomputeManifestDigest(manifest: PackageManifest): string {
  return sha256Hex(
    canonicalJson({
      kind: manifest.kind,
      version: manifest.version,
      commit: manifest.commit,
      artifacts: manifest.artifacts,
    }),
  );
}

export function serializePackageManifest(manifest: PackageManifest): string {
  return canonicalJson(manifest);
}

export function isPackageManifest(value: unknown): value is PackageManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record["kind"] !== "package-manifest") {
    return false;
  }
  if (typeof record["version"] !== "string" || typeof record["commit"] !== "string") {
    return false;
  }
  if (!isHex64(record["manifestDigest"])) {
    return false;
  }
  if (!Array.isArray(record["artifacts"])) {
    return false;
  }
  for (const artifact of record["artifacts"]) {
    if (!isPackagedArtifact(artifact)) {
      return false;
    }
  }
  return true;
}

function isPackagedArtifact(value: unknown): value is PackagedArtifact {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["digest"] !== "object" || record["digest"] === null) {
    return false;
  }
  const digest = record["digest"] as Record<string, unknown>;
  return (
    typeof record["role"] === "string" &&
    typeof record["path"] === "string" &&
    Array.isArray(record["targetIds"]) &&
    record["targetIds"].every((item) => typeof item === "string") &&
    typeof record["byteSize"] === "number" &&
    digest["algorithm"] === "sha256" &&
    typeof digest["hex"] === "string"
  );
}

export function parsePackageManifest(text: string): PackageManifest | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPackageManifest(value)) {
    return null;
  }
  if (recomputeManifestDigest(value) !== value.manifestDigest) {
    return null;
  }
  return value;
}

function finding(
  code: ManifestConsistencyCode,
  severity: "error" | "warning",
  artifactPath: string | null,
  targetId: string | null,
  message: string,
): ManifestConsistencyFinding {
  return Object.freeze({ code, severity, artifactPath, targetId, message });
}

function compareFindings(
  left: ManifestConsistencyFinding,
  right: ManifestConsistencyFinding,
): number {
  const byCode = compareStrings(left.code, right.code);
  if (byCode !== 0) {
    return byCode;
  }
  const byPath = compareStrings(left.artifactPath ?? "", right.artifactPath ?? "");
  if (byPath !== 0) {
    return byPath;
  }
  const byTarget = compareStrings(left.targetId ?? "", right.targetId ?? "");
  if (byTarget !== 0) {
    return byTarget;
  }
  return compareStrings(left.message, right.message);
}
