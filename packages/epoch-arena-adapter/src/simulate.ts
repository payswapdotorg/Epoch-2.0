/**
 * Simulated Arena endpoint: pure, in-memory, deterministic. Proves the
 * FULL round trip (task package -> return -> validate -> verify ->
 * proposal/rejection -> reuse decision) before any production
 * procurement. The simulation is a first-class tested citizen.
 */
import { digestOf, mintId } from "./canonical.js";
import { sealReturnPackage, validateReturnPackage } from "./return.js";
import { decideReuseRights } from "./reuse.js";
import { proposeWorldRevision } from "./revision.js";
import { acceptanceFromQualification } from "./task.js";
import type {
  ArenaReturnDraft,
  ArenaReturnPackage,
  ReturnValidation,
} from "./types-return.js";
import type { ReusePolicy, ReuseRightsDecision } from "./types-reuse.js";
import type { ArenaTaskPackage } from "./types-task.js";
import type {
  CriterionVerifier,
  ReturnVerification,
  WorldRevisionProposalResult,
} from "./types-verdict.js";
import { verifyReturn } from "./verify.js";

/** A deterministic simulated expert: task package in, draft out. */
export type SimulatedExpert = (task: ArenaTaskPackage) => ArenaReturnDraft;

export interface SimulationClock {
  readonly submittedAt: string;
  readonly verifiedAt: string;
  readonly proposedAt: string;
  readonly decidedAt: string;
}

export interface SimulatedRoundTripInput {
  readonly taskPackage: ArenaTaskPackage;
  readonly expert: SimulatedExpert;
  readonly verifier: CriterionVerifier;
  readonly reusePolicy: ReusePolicy;
  readonly clock: SimulationClock;
  readonly channel?: string;
  readonly reuseGapDigest?: string;
  readonly reuseDemonstrationDigest?: string;
}

export type SimulationOutcome = "accepted" | "accepted-partial" | "rejected";

/** Full record of one simulated round trip (deterministically digested). */
export interface SimulationTranscript {
  readonly simulationId: string;
  readonly taskPackageDigest: string;
  readonly returnPackage: ArenaReturnPackage;
  readonly validation: ReturnValidation;
  readonly verification: ReturnVerification;
  readonly proposal: WorldRevisionProposalResult;
  readonly reuseDecision: ReuseRightsDecision;
  readonly outcome: SimulationOutcome;
  readonly digest: string;
}

function outcomeOf(verification: ReturnVerification): SimulationOutcome {
  if (verification.kind === "rejected") {
    return "rejected";
  }
  if (verification.kind === "verified") {
    return "accepted";
  }
  return verification.acceptable ? "accepted-partial" : "rejected";
}

/** Run one full simulated round trip (pure). */
export function runSimulatedRoundTrip(
  input: SimulatedRoundTripInput,
): SimulationTranscript {
  const draft = input.expert(input.taskPackage);
  const returnPackage = sealReturnPackage(draft, input.taskPackage, {
    arena: "simulated",
    channel: input.channel ?? "simulated-arena",
    submittedAt: input.clock.submittedAt,
  });
  const validation = validateReturnPackage(returnPackage, input.taskPackage);
  const acceptance = acceptanceFromQualification(
    input.taskPackage.qualification,
    input.taskPackage.digest,
  );
  const verification = verifyReturn(
    returnPackage,
    acceptance,
    input.verifier,
    input.clock.verifiedAt,
  );
  const proposal = proposeWorldRevision(
    input.taskPackage,
    returnPackage,
    verification,
    { createdAt: input.clock.proposedAt },
  );
  let gapDigest = input.reuseGapDigest;
  if (gapDigest === undefined && input.taskPackage.gapRefs.length === 1) {
    gapDigest = input.taskPackage.gapRefs[0].capabilityGapDigest;
  }
  const reuseDecision = decideReuseRights(returnPackage, {
    decidedAt: input.clock.decidedAt,
    policy: input.reusePolicy,
    gapDigest,
    demonstrationDigest: input.reuseDemonstrationDigest,
  });
  const outcome = outcomeOf(verification);
  const body = {
    taskPackageDigest: input.taskPackage.digest,
    returnPackage,
    validation,
    verification,
    proposal,
    reuseDecision,
    outcome,
  };
  const digest = digestOf(body);
  return { ...body, simulationId: mintId("sim", digest), digest };
}

export interface SimulatedEndpointConfig {
  readonly verifier: CriterionVerifier;
  readonly reusePolicy: ReusePolicy;
}

export interface SimulatedSubmission {
  readonly taskPackage: ArenaTaskPackage;
  readonly expert: SimulatedExpert;
  readonly clock: SimulationClock;
  readonly channel?: string;
  readonly reuseGapDigest?: string;
  readonly reuseDemonstrationDigest?: string;
}

/** In-memory simulated Arena endpoint (no I/O, no network, no clock). */
export interface SimulatedArenaEndpoint {
  readonly name: "simulated-arena";
  submit(submission: SimulatedSubmission): SimulationTranscript;
  readonly transcripts: readonly SimulationTranscript[];
}

export function createSimulatedArenaEndpoint(
  config: SimulatedEndpointConfig,
): SimulatedArenaEndpoint {
  const transcripts: SimulationTranscript[] = [];
  return {
    name: "simulated-arena",
    submit(submission) {
      const transcript = runSimulatedRoundTrip({
        taskPackage: submission.taskPackage,
        expert: submission.expert,
        verifier: config.verifier,
        reusePolicy: config.reusePolicy,
        clock: submission.clock,
        channel: submission.channel,
        reuseGapDigest: submission.reuseGapDigest,
        reuseDemonstrationDigest: submission.reuseDemonstrationDigest,
      });
      transcripts.push(transcript);
      return transcript;
    },
    get transcripts() {
      return [...transcripts];
    },
  };
}
