/**
 * Independent reuse-rights decision.
 *
 * Independence law: this decision takes the RETURN (and its embedded
 * reuse permission request) plus host policy — it deliberately takes
 * NO verification result. Reuse permission is necessary, never
 * sufficient: downstream pipelines must additionally check acceptance
 * before acting on reused content.
 */
import { digestOf, isValidIso8601Utc, mintId } from "./canonical.js";
import type { ReuseScope } from "./types-core.js";
import type { ArenaReturnPackage } from "./types-return.js";
import type {
  DemonstrationPipelineLink,
  PromotionPipelineLink,
  ReuseBasis,
  ReuseDecisionKind,
  ReusePolicy,
  ReuseRightsDecision,
} from "./types-reuse.js";

export interface DecideReuseInput {
  readonly decidedAt: string;
  readonly policy: ReusePolicy;
  /** W032 CapabilityGap digest to link for promotion. */
  readonly gapDigest?: string;
  /** W029 Demonstration digest to link for capture. */
  readonly demonstrationDigest?: string;
}

/** Decide reuse rights for a return — independent of verification. */
export function decideReuseRights(
  ret: ArenaReturnPackage,
  input: DecideReuseInput,
): ReuseRightsDecision {
  if (!isValidIso8601Utc(input.decidedAt)) {
    throw new TypeError("decidedAt must be ISO-8601 UTC");
  }
  const allowed = new Set(input.policy.allowedScopes);
  const request = ret.reusePermissionRequested;
  let basis: ReuseBasis;
  let permitted: ReuseScope[];
  let conditions: string[];
  let decision: ReuseDecisionKind;
  if (request.kind === "granted") {
    const granted = [...new Set(request.scopes)];
    basis = { type: "expert-grant", grantedScopes: granted };
    permitted = granted.filter((scope) => allowed.has(scope));
    conditions = [...request.conditions, ...input.policy.mandatoryConditions];
    if (permitted.length === 0) {
      decision = "reuse-denied";
    } else if (permitted.length === granted.length) {
      decision = "reuse-permitted";
    } else {
      decision = "reuse-restricted";
    }
  } else if (request.kind === "denied") {
    basis = { type: "expert-denied", reason: request.reason };
    permitted = [];
    conditions = [...input.policy.mandatoryConditions];
    decision = "reuse-denied";
  } else {
    basis = { type: "expert-unspecified", fallback: "deny-until-clarified" };
    permitted = [];
    conditions = [
      ...input.policy.mandatoryConditions,
      "expert must clarify reuse permission before any reuse",
    ];
    decision = "reuse-denied";
  }
  const promotionLink: PromotionPipelineLink | undefined =
    permitted.includes("capability-promotion") && input.gapDigest !== undefined
      ? {
          pipeline: "w032-capability-learning",
          gapDigest: input.gapDigest,
          status: "linked",
        }
      : undefined;
  const demonstrationLink: DemonstrationPipelineLink | undefined =
    permitted.includes("demonstration-capture") &&
    input.demonstrationDigest !== undefined
      ? {
          pipeline: "w029-environment-activity",
          demonstrationDigest: input.demonstrationDigest,
          status: "linked",
        }
      : undefined;
  const body = {
    schemaVersion: "1" as const,
    decidedAt: input.decidedAt,
    returnDigest: ret.digest,
    decision,
    permittedScopes: permitted,
    conditions,
    basis,
    promotionLink,
    demonstrationLink,
  };
  const digest = digestOf(body);
  return { ...body, decisionId: mintId("rrd", digest), digest };
}
