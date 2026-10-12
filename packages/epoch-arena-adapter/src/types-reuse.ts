/**
 * Reuse-rights types. Law: the reuse-rights decision is INDEPENDENT of
 * verification — a rejected return can still carry a recorded reuse
 * decision, and an accepted return with reuse denied must never be
 * reused. Reuse permission is necessary, never sufficient.
 */
import type {
  Hex64,
  Iso8601,
  NonEmptyString,
  ReuseScope,
} from "./types-core.js";

/** Host-side reuse policy. */
export interface ReusePolicy {
  /** Scopes the host is willing to honor at all. */
  readonly allowedScopes: readonly ReuseScope[];
  /** Conditions appended to every decision. */
  readonly mandatoryConditions: readonly NonEmptyString[];
}

/** Why the decision came out the way it did. */
export type ReuseBasis =
  | {
      readonly type: "expert-grant";
      readonly grantedScopes: readonly ReuseScope[];
    }
  | { readonly type: "expert-denied"; readonly reason: NonEmptyString }
  | {
      readonly type: "expert-unspecified";
      readonly fallback: "deny-until-clarified";
    };

/** Link into the W032 capability-learning promotion pipeline. */
export interface PromotionPipelineLink {
  readonly pipeline: "w032-capability-learning";
  readonly gapDigest: Hex64;
  readonly status: "linked";
}

/** Link into the W029 environment-activity demonstration pipeline. */
export interface DemonstrationPipelineLink {
  readonly pipeline: "w029-environment-activity";
  readonly demonstrationDigest: Hex64;
  readonly status: "linked";
}

export type ReuseDecisionKind =
  "reuse-permitted" | "reuse-restricted" | "reuse-denied";

/** The independent reuse-rights decision. */
export interface ReuseRightsDecision {
  readonly schemaVersion: "1";
  readonly decisionId: NonEmptyString;
  readonly decidedAt: Iso8601;
  readonly returnDigest: Hex64;
  readonly decision: ReuseDecisionKind;
  /** Granted scopes that also pass host policy (deduped, ordered). */
  readonly permittedScopes: readonly ReuseScope[];
  readonly conditions: readonly NonEmptyString[];
  readonly basis: ReuseBasis;
  readonly promotionLink?: PromotionPipelineLink;
  readonly demonstrationLink?: DemonstrationPipelineLink;
  readonly digest: Hex64;
}
