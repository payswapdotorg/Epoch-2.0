/**
 * Public barrel for @zcode/epoch-engineering-objective.
 * Exports exactly the runtime names of src/contract.ts; asserted by
 * test/contract.test.ts via assertPublicContract.
 */

export {
  canonicalJson,
  digestCanonical,
  isSha256Digest,
  sha256Hex,
  toSha256Digest,
} from "./canonical.js";
export type { Sha256Digest } from "./canonical.js";

export {
  CONTRACT_LAWS,
  CONTRACT_NAME,
  CONTRACT_REVISION,
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "./contract.js";
export type {
  ContractAssertion,
  ContractEntry,
  ContractEntryKind,
} from "./contract.js";

export {
  KNOWN_NAMESPACES,
  digestRef,
  durationMeasure,
  evidenceRef,
  lifecyclePhaseKey,
  monetaryCost,
  normalizeDigestRef,
  normalizeDurationMeasure,
  normalizeEvidenceRef,
  normalizeMonetaryCost,
  qualityAcceptanceThreshold,
  qualityScore,
} from "./types/core.js";
export type {
  DigestRef,
  DigestRefInput,
  DurationMeasure,
  EvidenceRef,
  EvidenceRefInput,
  KnownNamespace,
  LifecyclePhaseKey,
  MonetaryCost,
  QualityAcceptanceThreshold,
  QualityScore,
} from "./types/core.js";

export { AUTOMATION_DENOMINATOR_DEFAULT_POLICY } from "./types/task-family.js";
export type {
  AutomationDenominator,
  AutomationDenominatorDefaultPolicy,
  TaskClassRule,
  TaskFamily,
  TaskFamilyRef,
} from "./types/task-family.js";

export type {
  CompletionRecord,
  FailedVerification,
  QualityMetricVerification,
  UnverifiedOutput,
  VerifiedQuality,
  VerifiedQualityMetric,
  VerifiedQualityShare,
} from "./types/completion.js";

export type {
  BaselineMeasure,
  BaselineScope,
  InterventionMeasure,
  InterventionNonQualificationReason,
  InterventionProgress,
  InterventionProgressInput,
  NonQualifyingInterventionProgress,
  QualifiedInterventionProgress,
} from "./types/measures.js";

export type {
  SafetyRegressionMeasure,
  SafetyRegressionStatus,
  SafetyRegressionSummary,
} from "./types/safety.js";

export type {
  CapabilityReuseObservation,
  CapabilityReuseRate,
  EscalationRate,
  ReusedCapability,
  TaskExecutionMode,
  TaskExecutionRecord,
} from "./types/rates.js";

export type {
  AbundanceClaim,
  AbundanceClaimBlockReason,
  Feasibility,
  LowerCostClaim,
  NoAbundanceClaim,
  OutcomeActual,
  OutcomePrediction,
  PredictionVarianceRecord,
} from "./types/variance.js";

export { END_TO_END_STAGES } from "./types/end-to-end.js";
export type {
  Bottleneck,
  EndToEndCase,
  EndToEndStageKey,
  LimitationsReport,
  ProvenanceFailure,
  ProvenanceOk,
  ProvenanceVerification,
  SealedEndToEndStage,
} from "./types/end-to-end.js";

export type {
  AbundanceEvaluation,
  AbundanceEvaluationInput,
  ClaimableCostDelta,
  CompletionShare,
  InterventionProgressEntry,
} from "./types/evaluation.js";

export {
  automationDenominator,
  sameTaskFamily,
  taskClassRule,
  taskFamily,
  taskFamilyRef,
} from "./build/denominators.js";

export type { CompletionRecordInput, QualityMetricInput } from "./build/completion.js";
export {
  completionRecord,
  effectiveQualityScore,
  isVerifiedQualityAcceptable,
  qualityMetric,
  verifiedQualityShare,
} from "./build/completion.js";

export type { BaselineMeasureInput, InterventionMeasureInput } from "./build/measures.js";
export {
  baselineMeasure,
  evaluateInterventionProgress,
  interventionMeasure,
} from "./build/measures.js";

export type { SafetyRegressionMeasureInput } from "./build/safety.js";
export { safetyRegressionMeasure, summarizeSafetyRegressions } from "./build/safety.js";

export type {
  CapabilityReuseObservationInput,
  TaskExecutionModeInput,
  TaskExecutionRecordInput,
} from "./build/rates.js";
export {
  capabilityReuseObservation,
  computeCapabilityReuseRate,
  computeEscalationRate,
  taskExecutionRecord,
} from "./build/rates.js";

export type {
  FeasibilityInput,
  OutcomeActualInput,
  OutcomePredictionInput,
  PredictionVarianceRecordInput,
} from "./build/variance.js";
export { evaluateAbundanceClaim, predictionVarianceRecord } from "./build/variance.js";

export type {
  BottleneckInput,
  EndToEndCaseInput,
  EndToEndStageSpecInput,
  LimitationsReportInput,
} from "./build/end-to-end.js";
export {
  buildEndToEndCase,
  buildLimitationsReport,
  verifyEndToEndCase,
} from "./build/end-to-end.js";

export { evaluateAbundance } from "./build/evaluation.js";

export { MODULE_ARTIFACTS, MODULE_NAME, moduleIdentityDigest } from "./module.js";
export type { ModuleArtifact, ModuleArtifactRole } from "./module.js";
