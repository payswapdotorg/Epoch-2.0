/**
 * Contract home for @zcode/epoch-productization.
 *
 * Every public VALUE of this package is re-exported here and only here
 * (src/index.ts re-exports this file plus the module manifest). The
 * CONTRACT_SURFACE list enumerates the public value surface and is
 * asserted against the live module namespace by the contract-surface
 * test — the surface cannot drift silently.
 */

export {
  CanonicalizationError,
  canonicalJson,
  compareStrings,
  digestCanonical,
  isHex64,
  sha256Hex,
} from "./canonical.js";

export {
  DEPLOYMENT_TARGETS,
  PERMISSION_GRANTS,
  RELEASE_ARTIFACT_KINDS,
  deploymentTargetInvariants,
  deploymentTargetsDigest,
  deploymentTargetsForArtifact,
  findDeploymentTarget,
  listDeploymentTargets,
  permissionInventory,
} from "./deployment-targets.js";
export type {
  DeploymentChannelKind,
  DeploymentTarget,
  PermissionGrant,
  PermissionInventoryEntry,
  ReleaseArtifactKind,
} from "./deployment-targets.js";

export {
  RELEASE_CHECKLIST,
  defineReleaseCommand,
  releaseChecklist,
  releaseChecklistDigest,
  releaseGate,
  releaseGateOrder,
} from "./release-checklist.js";
export type {
  ReleaseChecklist,
  ReleaseCommand,
  ReleaseCommandEnv,
  ReleaseFailurePolicy,
  ReleaseGate,
  ReleaseGateId,
} from "./release-checklist.js";

export {
  DeploymentPlanError,
  deriveDeploymentPlan,
  isDeploymentPlan,
  parseDeploymentPlan,
  recomputePlanDigest,
  serializeDeploymentPlan,
} from "./deployment-plan.js";
export type {
  CommandPolicy,
  DeploymentPlan,
  DeploymentPlanErrorCode,
  DeploymentPlanInput,
  DeploymentPlanStep,
  DeploymentStepKind,
} from "./deployment-plan.js";

export { verifyStoreIntegrity } from "./store-integrity.js";
export type {
  StoreFindingTotal,
  StoreIntegrityFinding,
  StoreIntegrityFindingCode,
  StoreIntegrityReport,
  StoreIntegritySeverity,
  WorldStorePort,
} from "./store-integrity.js";

export { storeHealthReport } from "./store-health.js";
export type { StoreHealthReport, StoreHealthStatus } from "./store-health.js";

export {
  SECURITY_CHECKLIST,
  SECURITY_CHECKLIST_SECTIONS,
  securityChecklist,
  securityChecklistDigest,
  securityChecksBySection,
} from "./security-checklist.js";
export type {
  SecurityCheck,
  SecurityChecklist,
  SecurityChecklistSectionId,
} from "./security-checklist.js";

export {
  knownSecretPatternIds,
  redactPreview,
  redactSecrets,
  scanForSecrets,
  shannonEntropy,
} from "./secret-scan.js";
export type { SecretFinding, SecretPatternId, SecretSeverity } from "./secret-scan.js";

export {
  DEFAULT_TELEMETRY_POLICY,
  TELEMETRY_CATEGORIES,
  TELEMETRY_UNITS,
  TelemetryContractError,
  createTelemetryEvent,
  createTelemetryPolicy,
  deploymentPlanSummaryEvents,
  formatTelemetryBatch,
  formatTelemetryLine,
  packageManifestSummaryEvents,
  secretScanSummaryEvent,
  serializeTelemetryEvent,
  storeIntegritySummaryEvents,
  telemetryEventDigest,
} from "./telemetry.js";
export type {
  TelemetryEvent,
  TelemetryEventCategory,
  TelemetryEventInput,
  TelemetryPolicy,
  TelemetryPolicyInput,
  TelemetrySinkKind,
  TelemetryUnit,
} from "./telemetry.js";

export {
  isPackageManifest,
  parsePackageManifest,
  recomputeManifestDigest,
  serializePackageManifest,
  verifyManifestConsistency,
} from "./packaging.js";
export type {
  ArtifactDigest,
  ManifestConsistencyCode,
  ManifestConsistencyFinding,
  ManifestConsistencyReport,
  PackageManifest,
  PackagedArtifact,
} from "./packaging.js";

export const CONTRACT_SURFACE: readonly string[] = Object.freeze([
  "CanonicalizationError",
  "CONTRACT_LAWS",
  "CONTRACT_SURFACE",
  "DEFAULT_TELEMETRY_POLICY",
  "DeploymentPlanError",
  "DEPLOYMENT_TARGETS",
  "PERMISSION_GRANTS",
  "RELEASE_ARTIFACT_KINDS",
  "RELEASE_CHECKLIST",
  "SECURITY_CHECKLIST",
  "SECURITY_CHECKLIST_SECTIONS",
  "TELEMETRY_CATEGORIES",
  "TELEMETRY_UNITS",
  "TelemetryContractError",
  "canonicalJson",
  "compareStrings",
  "createTelemetryEvent",
  "createTelemetryPolicy",
  "defineReleaseCommand",
  "deploymentPlanSummaryEvents",
  "deploymentTargetInvariants",
  "deploymentTargetsDigest",
  "deploymentTargetsForArtifact",
  "deriveDeploymentPlan",
  "digestCanonical",
  "findDeploymentTarget",
  "formatTelemetryBatch",
  "formatTelemetryLine",
  "isDeploymentPlan",
  "isHex64",
  "isPackageManifest",
  "knownSecretPatternIds",
  "listDeploymentTargets",
  "packageManifestSummaryEvents",
  "parseDeploymentPlan",
  "parsePackageManifest",
  "permissionInventory",
  "recomputeManifestDigest",
  "recomputePlanDigest",
  "redactPreview",
  "redactSecrets",
  "releaseChecklist",
  "releaseChecklistDigest",
  "releaseGate",
  "releaseGateOrder",
  "scanForSecrets",
  "secretScanSummaryEvent",
  "securityChecklist",
  "securityChecklistDigest",
  "securityChecksBySection",
  "serializeDeploymentPlan",
  "serializePackageManifest",
  "serializeTelemetryEvent",
  "sha256Hex",
  "shannonEntropy",
  "storeHealthReport",
  "storeIntegritySummaryEvents",
  "telemetryEventDigest",
  "verifyManifestConsistency",
  "verifyStoreIntegrity",
]);

export const CONTRACT_LAWS: readonly string[] = Object.freeze([
  "src/module.ts manifest + src/contract.ts contract home",
  "every source file <= 400 lines; src/contract.ts <= 300 lines",
  "SHA-256 only via node:crypto createHash('sha256')",
  "deterministic canonical serialization for all derived data",
  "commands are data: plan and verify only, never execute or deploy",
  "store sweeps are read-only through the structural WorldStorePort",
  "telemetry is privacy-safe by construction: counts and labels only",
]);
