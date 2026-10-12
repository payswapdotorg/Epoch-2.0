/**
 * Public entrypoint for @zcode/epoch-arena-adapter.
 */
import type { ArenaAdapterContract } from "./contract.js";
import {
  acceptanceFromQualification,
  applyRedactions,
  buildArenaTaskPackage,
  verifyTaskPackageDigest,
} from "./task.js";
import {
  returnPackageDigest,
  sealReturnPackage,
  validateReturnPackage,
} from "./return.js";
import { standardCriterionVerifier, verifyReturn } from "./verify.js";
import { proposeWorldRevision } from "./revision.js";
import { decideReuseRights } from "./reuse.js";
import {
  createSimulatedArenaEndpoint,
  runSimulatedRoundTrip,
} from "./simulate.js";

export {
  MODULE_DESCRIPTION,
  MODULE_LAYER,
  MODULE_MANIFEST,
  MODULE_NAME,
  MODULE_VERSION,
} from "./module.js";
export type { ModuleManifest } from "./module.js";

export { ARENA_ADAPTER_CONTRACT_VERSION } from "./contract.js";

export type {
  DeliverableKind,
  EvidenceExport,
  EvidenceKind,
  EvidencePayload,
  EvidenceSource,
  GapRef,
  Hex64,
  Iso8601,
  JsonValue,
  NonEmptyString,
  RedactionRule,
  ReusePermissionRequest,
  ReuseScope,
  AcceptanceCriterion,
  AcceptanceSpec,
  ArenaTaskPackage,
  CriterionCheck,
  ExpertiseRequirement,
  QualificationMetadata,
  TaskBudget,
  TaskScope,
  ArenaReturnDraft,
  ArenaReturnPackage,
  DeliverableClaim,
  DeliverableRef,
  ExpertDeclaration,
  ReturnProvenance,
  ReturnValidation,
  ReturnValidationIssue,
  CriterionOutcome,
  CriterionVerifier,
  PartialReason,
  PartialResult,
  ProposalBlockedReason,
  RejectedResult,
  RejectionReason,
  ReturnVerification,
  VerifiedResult,
  WorldChange,
  WorldRevisionProposal,
  WorldRevisionProposalResult,
  DemonstrationPipelineLink,
  PromotionPipelineLink,
  ReuseBasis,
  ReuseDecisionKind,
  ReusePolicy,
  ReuseRightsDecision,
  BuildTaskPackageInput,
  SealReturnInput,
  ProposeRevisionInput,
  DecideReuseInput,
  SimulatedArenaEndpoint,
  SimulatedEndpointConfig,
  SimulatedExpert,
  SimulatedRoundTripInput,
  SimulatedSubmission,
  SimulationClock,
  SimulationOutcome,
  SimulationTranscript,
} from "./contract.js";

export {
  acceptanceFromQualification,
  applyRedactions,
  buildArenaTaskPackage,
  verifyTaskPackageDigest,
  returnPackageDigest,
  sealReturnPackage,
  validateReturnPackage,
  standardCriterionVerifier,
  verifyReturn,
  proposeWorldRevision,
  decideReuseRights,
  createSimulatedArenaEndpoint,
  runSimulatedRoundTrip,
};

/**
 * The whole public API as one object, compile-time checked against the
 * contract home (src/contract.ts).
 */
export const arenaAdapterApi = {
  buildArenaTaskPackage,
  applyRedactions,
  acceptanceFromQualification,
  verifyTaskPackageDigest,
  sealReturnPackage,
  returnPackageDigest,
  validateReturnPackage,
  standardCriterionVerifier,
  verifyReturn,
  proposeWorldRevision,
  decideReuseRights,
  runSimulatedRoundTrip,
  createSimulatedArenaEndpoint,
} satisfies ArenaAdapterContract;
