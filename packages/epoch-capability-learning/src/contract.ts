/**
 * Contract home for `@zcode/epoch-capability-learning` (W032).
 *
 * This file enumerates the COMPLETE public surface of the package;
 * everything not re-exported here is internal. Authority boundaries:
 * W029 / W030 / W023 records are referenced by digest only (no second
 * semantic authority), and no exported function executes anything (no
 * execution authority).
 */

export { canonicalJson, digestRecord, isValidDigest, sha256Hex } from "./hashing.js";
export { CanonicalizationError, GapRoutingError, InvalidRecordError } from "./errors.js";

export { classifyGap, GAP_ROUTES, GAP_ROUTING_RULES, recordGap } from "./gaps.js";
export type {
  CapabilityGap,
  EnvironmentDefect,
  GapClassification,
  GapFacts,
  GapRouteCondition,
  GapRouteName,
  GapRouteReason,
  GapRoutingRule,
  ReproductionFact,
} from "./gaps.js";

export type {
  CapabilityRef,
  DemonstrationRef,
  HumanIntervention,
  InterventionRef,
} from "./refs.js";

export {
  CANDIDATE_SCHEMA_VERSION,
  candidateIdentity,
  computeCandidateId,
  extractLearningCandidate,
  reviseCandidate,
} from "./candidates.js";
export type {
  BehaviorCondition,
  BehaviorConditionKind,
  BehaviorDraft,
  BehaviorStep,
  BehaviorStepKind,
  CandidateExtractionInput,
  CandidateIdentity,
  CandidateRevision,
  CandidateRevisionInput,
  CandidateRevisionRejection,
  CandidateSourceRef,
  DemonstrationVerification,
  LearnedBehavior,
  LearningCandidate,
  LearningExtraction,
  LearningExtractionRejection,
  OutcomeClassification,
} from "./candidates.js";

export { applyGeneralization, declareScope, validateGeneralization } from "./generalization.js";
export type {
  GeneralizationApplication,
  GeneralizationRejection,
  GeneralizationStatus,
  GeneralizationValidation,
  HeldOutReplayCase,
  OriginalReplayCase,
  ReplayCase,
  ReplayObservation,
  ScopeDeclaration,
  ScopeDimension,
} from "./generalization.js";

export {
  ALL_CANDIDATE_RIGHTS,
  authorizeReuse,
  defineReusePolicy,
  REUSE_LEVEL_RIGHTS,
} from "./reuse.js";
export type {
  CandidateRight,
  ReuseBasis,
  ReuseBasisKind,
  ReuseContext,
  ReuseContextKind,
  ReuseDecision,
  ReuseDenial,
  ReuseLevel,
  ReusePolicy,
  ReusePolicyDefinition,
  ReusePolicyDraft,
  ReusePolicyRejection,
  ReuseRequest,
} from "./reuse.js";

export { AUTONOMY_LADDER } from "./autonomy.js";
export type {
  ApprovalBasisKind,
  AutonomyLevel,
  AutonomyLevelDescriptor,
  PromotionBasis,
} from "./autonomy.js";

export { approvePromotion, proposePromotion } from "./promotion.js";
export type {
  ApprovalRecord,
  ApprovalRefusal,
  PermittedReuseDecision,
  PromotionApprovalResult,
  PromotionProposal,
  PromotionProposalInput,
  PromotionProposalResult,
  PromotionRecord,
  ProposalRefusal,
} from "./promotion.js";

export type {
  GuardedMetric,
  RollbackActivationPolicy,
  RollbackComparator,
  RollbackMetadata,
  RollbackPlan,
  RollbackTrigger,
} from "./rollback.js";

export {
  defineMeasurementSnapshot,
  INTERVENTION_COST_WEIGHTS,
  interventionCostUnits,
} from "./measurement.js";
export type {
  InterventionCostReading,
  MeasurementDefinition,
  MeasurementDraft,
  MeasurementRejection,
  MeasurementSnapshot,
  QualificationOutcome,
  QualificationRef,
  QualityReading,
  SafetyReading,
} from "./measurement.js";

export {
  establishRegressionWatch,
  evaluateRegression,
  REGRESSION_TOLERANCES,
} from "./regression.js";
export type {
  MetricDirection,
  PromotionRef,
  QualificationComparison,
  RegressionComparison,
  RegressionFinding,
  RegressionReading,
  RegressionVerdict,
  RegressionWatch,
  RegressionWatchInput,
  RegressionWatchResult,
  RollbackSignal,
  WatchRejection,
} from "./regression.js";

export { MODULE_ID, MODULE_VERSION, moduleManifest } from "./module.js";
export type { ModuleDependencyRef, ModuleLaw, ModuleManifest } from "./module.js";
