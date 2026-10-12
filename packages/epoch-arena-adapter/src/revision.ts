/**
 * World-revision proposal construction. The adapter NEVER writes world
 * state — it emits canonical proposals for the world/verification
 * authority.
 */
import { digestOf, isValidIso8601Utc, mintId } from "./canonical.js";
import type { ArenaReturnPackage } from "./types-return.js";
import type { ArenaTaskPackage } from "./types-task.js";
import type {
  ReturnVerification,
  WorldChange,
  WorldRevisionProposal,
  WorldRevisionProposalResult,
} from "./types-verdict.js";

export interface ProposeRevisionInput {
  readonly createdAt: string;
  readonly summary?: string;
  readonly extraChanges?: readonly WorldChange[];
}

function defaultChanges(
  taskPackage: ArenaTaskPackage,
  ret: ArenaReturnPackage,
): WorldChange[] {
  const gapLinks: WorldChange[] = taskPackage.gapRefs.map((g) => ({
    changeKind: "link-capability-gap" as const,
    gapId: g.gapId,
    gapDigest: g.capabilityGapDigest,
    note: `arena return ${ret.returnId} addresses capability gap ${g.gapId}`,
  }));
  const knowledge: WorldChange = {
    changeKind: "append-knowledge",
    topic: `arena-return:${ret.returnId}`,
    content: `${ret.declaration.expertId} returned ${ret.deliverables.length} deliverable(s); attestation: ${ret.declaration.attestation}`,
  };
  return [...gapLinks, knowledge];
}

/**
 * Build a world-revision proposal from a verified (or acceptably
 * partial) verification. Rejected / unacceptable-partial returns block
 * the proposal with typed reasons.
 */
export function proposeWorldRevision(
  taskPackage: ArenaTaskPackage,
  ret: ArenaReturnPackage,
  verification: ReturnVerification,
  input: ProposeRevisionInput,
): WorldRevisionProposalResult {
  if (!isValidIso8601Utc(input.createdAt)) {
    throw new TypeError("createdAt must be ISO-8601 UTC");
  }
  if (verification.kind === "rejected") {
    return {
      ok: false,
      blocked: [{ type: "return-rejected", returnDigest: ret.digest }],
    };
  }
  if (verification.kind === "partial" && !verification.acceptable) {
    return {
      ok: false,
      blocked: [
        {
          type: "partial-not-acceptable",
          returnDigest: ret.digest,
          acceptanceFraction: verification.acceptanceFraction,
        },
      ],
    };
  }
  const changes = [
    ...defaultChanges(taskPackage, ret),
    ...(input.extraChanges ?? []),
  ];
  const body = {
    schemaVersion: "1" as const,
    createdAt: input.createdAt,
    summary:
      input.summary ??
      `Arena return ${ret.returnId} accepted (${verification.kind}); proposes world changes.`,
    basedOn: {
      taskPackageDigest: taskPackage.digest,
      returnDigest: ret.digest,
      outcome:
        verification.kind === "verified"
          ? ("verified" as const)
          : ("partial" as const),
      acceptanceFraction:
        verification.kind === "verified" ? 1 : verification.acceptanceFraction,
    },
    changes,
  };
  const digest = digestOf(body);
  return {
    ok: true,
    proposal: { ...body, proposalId: mintId("wrp", digest), digest },
  };
}
