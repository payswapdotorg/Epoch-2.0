/**
 * Contract home for @zcode/epoch-arena-adapter (module-artifact law).
 *
 * Normative laws, enforced by tests (test/manifest.test.ts) and review:
 *
 * 1. No execution authority: every export is pure and deterministic
 *    over typed data — no I/O, no clock reads, no network, no
 *    randomness. Timestamps are always explicit inputs.
 * 2. Hash law: SHA-256 only via node:crypto createHash("sha256")
 *    (src/canonical.ts) — never hand-rolled.
 * 3. Canonical serialization: every digest covers canonicalJson of the
 *    record body (sorted keys, no whitespace, undefined dropped).
 * 4. No second semantic authority: the adapter packages and verifies
 *    data; it emits WorldRevisionProposals for the world/verification
 *    authority and never writes world state itself.
 * 5. Loose coupling: W025 / W029 / W032 records are referenced BY
 *    DIGEST ONLY — never imported, never re-interpreted here.
 * 6. Validation on receipt: expert output is NEVER assumed correct
 *    because it came from an expert — validateReturnPackage runs
 *    before anything else consumes a return, and verifyReturn
 *    re-checks structure independently.
 * 7. Partial acceptance law: must-have criteria are hard (met or
 *    unmet; unmet rejects). should-have criteria may be partial; a
 *    partial result is acceptable iff every should-have is met or
 *    partial with fraction >= its partialFloor.
 * 8. Reuse independence law: decideReuseRights takes NO verification
 *    result. Reuse permission is necessary, never sufficient.
 * 9. The simulated endpoint is a first-class citizen: pure, in-memory,
 *    deterministic, tested on the same paths as production.
 */

import type {
  EvidencePayload,
  Hex64,
  Iso8601,
  RedactionRule,
} from "./types-core.js";
import type {
  AcceptanceCriterion,
  AcceptanceSpec,
  ArenaTaskPackage,
  QualificationMetadata,
} from "./types-task.js";
import type {
  ArenaReturnDraft,
  ArenaReturnPackage,
  ReturnValidation,
} from "./types-return.js";
import type {
  CriterionOutcome,
  CriterionVerifier,
  ReturnVerification,
  WorldRevisionProposalResult,
} from "./types-verdict.js";
import type { ReuseRightsDecision } from "./types-reuse.js";
import type { BuildTaskPackageInput } from "./task.js";
import type { SealReturnInput } from "./return.js";
import type { ProposeRevisionInput } from "./revision.js";
import type { DecideReuseInput } from "./reuse.js";
import type {
  SimulatedArenaEndpoint,
  SimulatedEndpointConfig,
  SimulatedRoundTripInput,
  SimulationTranscript,
} from "./simulate.js";

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
} from "./types-core.js";
export type {
  AcceptanceCriterion,
  AcceptanceSpec,
  ArenaTaskPackage,
  CriterionCheck,
  ExpertiseRequirement,
  QualificationMetadata,
  TaskBudget,
  TaskScope,
} from "./types-task.js";
export type {
  ArenaReturnDraft,
  ArenaReturnPackage,
  DeliverableClaim,
  DeliverableRef,
  ExpertDeclaration,
  ReturnProvenance,
  ReturnValidation,
  ReturnValidationIssue,
} from "./types-return.js";
export type {
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
} from "./types-verdict.js";
export type {
  DemonstrationPipelineLink,
  PromotionPipelineLink,
  ReuseBasis,
  ReuseDecisionKind,
  ReusePolicy,
  ReuseRightsDecision,
} from "./types-reuse.js";
export type { BuildTaskPackageInput } from "./task.js";
export type { SealReturnInput } from "./return.js";
export type { ProposeRevisionInput } from "./revision.js";
export type { DecideReuseInput } from "./reuse.js";
export type {
  SimulatedArenaEndpoint,
  SimulatedEndpointConfig,
  SimulatedExpert,
  SimulatedRoundTripInput,
  SimulatedSubmission,
  SimulationClock,
  SimulationOutcome,
  SimulationTranscript,
} from "./simulate.js";

/** Version of this contract (bump on breaking public-API change). */
export const ARENA_ADAPTER_CONTRACT_VERSION = "1";

/**
 * The public functional contract. `arenaAdapterApi` in src/index.ts is
 * compile-time checked (`satisfies`) against this interface.
 */
export interface ArenaAdapterContract {
  /** Build a task package: minimize evidence to scope, redact, seal. */
  readonly buildArenaTaskPackage: (
    input: BuildTaskPackageInput,
  ) => ArenaTaskPackage;
  /** Apply redaction rules to one evidence payload (pure). */
  readonly applyRedactions: (
    payload: EvidencePayload,
    rules: readonly RedactionRule[],
  ) => { payload: EvidencePayload; applied: readonly string[] };
  /** Derive the acceptance spec from qualification + task digest. */
  readonly acceptanceFromQualification: (
    qualification: QualificationMetadata,
    taskPackageDigest: Hex64,
  ) => AcceptanceSpec;
  /** Recompute + check a task package's digest and derived id. */
  readonly verifyTaskPackageDigest: (pkg: ArenaTaskPackage) => boolean;
  /** Seal a draft into a return package (bookkeeping, NOT approval). */
  readonly sealReturnPackage: (
    draft: ArenaReturnDraft,
    taskPackage: ArenaTaskPackage,
    input: SealReturnInput,
  ) => ArenaReturnPackage;
  /** Recompute a return package's digest. */
  readonly returnPackageDigest: (pkg: ArenaReturnPackage) => Hex64;
  /** Structural validation on receipt (typed issues, never throws). */
  readonly validateReturnPackage: (
    ret: ArenaReturnPackage,
    taskPackage: ArenaTaskPackage,
  ) => ReturnValidation;
  /** The standard deterministic criterion verifier. */
  readonly standardCriterionVerifier: (
    criterion: AcceptanceCriterion,
    ret: ArenaReturnPackage,
  ) => CriterionOutcome;
  /** Deterministic verification against acceptance criteria. */
  readonly verifyReturn: (
    ret: ArenaReturnPackage,
    acceptance: AcceptanceSpec,
    verifier: CriterionVerifier,
    verifiedAt: Iso8601,
  ) => ReturnVerification;
  /** Build (or refuse, with typed reasons) a world-revision proposal. */
  readonly proposeWorldRevision: (
    taskPackage: ArenaTaskPackage,
    ret: ArenaReturnPackage,
    verification: ReturnVerification,
    input: ProposeRevisionInput,
  ) => WorldRevisionProposalResult;
  /** Independent reuse-rights decision (no verification input). */
  readonly decideReuseRights: (
    ret: ArenaReturnPackage,
    input: DecideReuseInput,
  ) => ReuseRightsDecision;
  /** Run one full simulated round trip (pure, deterministic). */
  readonly runSimulatedRoundTrip: (
    input: SimulatedRoundTripInput,
  ) => SimulationTranscript;
  /** Create an in-memory simulated Arena endpoint. */
  readonly createSimulatedArenaEndpoint: (
    config: SimulatedEndpointConfig,
  ) => SimulatedArenaEndpoint;
}
