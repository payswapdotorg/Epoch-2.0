/**
 * Autonomy-level promotion ladder (W032 §5) — pure data.
 *
 * Promotion climbs one rung at a time. Each rung declares the approval basis
 * it requires and whether a regression watch is mandatory for operation at
 * that level (the watch itself is established after approval, W032 §6).
 */

export type AutonomyLevel = "proposal-only" | "supervised" | "observed" | "autonomous";

export type ApprovalBasisKind =
  | "proposer-declaration"
  | "human-review"
  | "measured-evidence"
  | "measured-evidence-and-regression-history";

/** Who/what basis a promotion step rests on. */
export interface PromotionBasis {
  readonly basisKind: ApprovalBasisKind;
  readonly evidenceRefs: readonly string[];
  readonly statement: string;
}

export interface AutonomyLevelDescriptor {
  readonly level: AutonomyLevel;
  readonly rung: number;
  readonly requiredBasis: ApprovalBasisKind;
  readonly requiresRegressionWatch: boolean;
  readonly requiresRollbackPlan: boolean;
  readonly description: string;
}

/** The autonomy promotion ladder (data). */
export const AUTONOMY_LADDER: readonly AutonomyLevelDescriptor[] = [
  {
    level: "proposal-only",
    rung: 0,
    requiredBasis: "proposer-declaration",
    requiresRegressionWatch: false,
    requiresRollbackPlan: true,
    description: "Capability output may be proposed as guidance only; every use needs an explicit human invitation.",
  },
  {
    level: "supervised",
    rung: 1,
    requiredBasis: "human-review",
    requiresRegressionWatch: true,
    requiresRollbackPlan: true,
    description: "Capability may act under step-level human supervision.",
  },
  {
    level: "observed",
    rung: 2,
    requiredBasis: "measured-evidence",
    requiresRegressionWatch: true,
    requiresRollbackPlan: true,
    description: "Capability may act unsupervised while a regression watch measures its episodes.",
  },
  {
    level: "autonomous",
    rung: 3,
    requiredBasis: "measured-evidence-and-regression-history",
    requiresRegressionWatch: true,
    requiresRollbackPlan: true,
    description: "Capability may act without a live watch; continued operation rests on recorded regression history.",
  },
];
