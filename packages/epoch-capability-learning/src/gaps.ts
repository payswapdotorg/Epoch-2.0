import { digestRecord, isValidDigest } from "./hashing.js";
import { GapRoutingError, InvalidRecordError } from "./errors.js";
import type {
  CapabilityRef,
  DemonstrationRef,
  InterventionRef,
} from "./refs.js";

/**
 * Gap records + deterministic gap classification (W032 §1).
 *
 * `classifyGap` is a pure fold over the ordered rule table
 * `GAP_ROUTING_RULES` — routing is DATA: table order is the precedence, and
 * every route carries a typed reason. No wall-clock time, no randomness.
 */

/** The six governed gap routes. */
export type GapRouteName =
  | "evidence-request"
  | "environment-repair"
  | "existing-capability"
  | "demonstration"
  | "reproduction"
  | "expert-escalation";

/** All gap routes, in routing-precedence order (data). */
export const GAP_ROUTES: readonly GapRouteName[] = [
  "environment-repair",
  "evidence-request",
  "existing-capability",
  "demonstration",
  "reproduction",
  "expert-escalation",
];

/** Typed reason for each route, discriminated by `kind`. */
export type GapRouteReason =
  | {
      readonly kind: "environment-repair";
      readonly defectKinds: readonly string[];
      readonly defectCount: number;
    }
  | {
      readonly kind: "evidence-request";
      readonly missingEvidenceKinds: readonly string[];
    }
  | {
      readonly kind: "existing-capability";
      readonly coveringCapabilityId: string;
      readonly coveringCapabilityDigest: string;
    }
  | {
      readonly kind: "demonstration";
      readonly demonstrationDigest: string;
      readonly episodeId: string;
    }
  | {
      readonly kind: "reproduction";
      readonly reproductionDigest: string;
      readonly reproducedInEpisodes: readonly string[];
    }
  | {
      readonly kind: "expert-escalation";
      readonly exhaustedRoutes: readonly GapRouteName[];
    };

/** An environment defect observed while investigating the gap. */
export interface EnvironmentDefect {
  readonly defectKind: string;
  readonly description: string;
  readonly evidenceDigest: string;
}

/** A reproduction of the target behavior outside a verified demonstration. */
export interface ReproductionFact {
  readonly reproductionDigest: string;
  readonly reproducedInEpisodes: readonly string[];
}

/** Observed facts about a capability gap (supplied from W029/W023 evidence). */
export interface GapFacts {
  readonly targetCapability: CapabilityRef;
  readonly intervention: InterventionRef;
  readonly occurredInEpoch: string;
  readonly missingEvidenceKinds: readonly string[];
  readonly environmentDefects: readonly EnvironmentDefect[];
  readonly coveringCapability: CapabilityRef | null;
  readonly verifiedDemonstration: DemonstrationRef | null;
  readonly reproduction: ReproductionFact | null;
}

/** Declarative routing condition over `GapFacts` (routing is data). */
export type GapRouteCondition =
  | {
      readonly kind: "environment-defects-present";
      readonly minimumDefects: number;
    }
  | {
      readonly kind: "missing-evidence-present";
      readonly minimumKinds: number;
    }
  | { readonly kind: "covering-capability-present" }
  | { readonly kind: "verified-demonstration-present" }
  | { readonly kind: "reproduction-present" }
  | { readonly kind: "fallback" };

/** One routing rule: condition → route. Table order is the precedence. */
export interface GapRoutingRule {
  readonly ruleId: string;
  readonly route: GapRouteName;
  readonly condition: GapRouteCondition;
}

/** The gap routing table (data). The first matching rule wins. */
export const GAP_ROUTING_RULES: readonly GapRoutingRule[] = [
  {
    ruleId: "rule/environment-repair",
    route: "environment-repair",
    condition: { kind: "environment-defects-present", minimumDefects: 1 },
  },
  {
    ruleId: "rule/evidence-request",
    route: "evidence-request",
    condition: { kind: "missing-evidence-present", minimumKinds: 1 },
  },
  {
    ruleId: "rule/existing-capability",
    route: "existing-capability",
    condition: { kind: "covering-capability-present" },
  },
  {
    ruleId: "rule/demonstration",
    route: "demonstration",
    condition: { kind: "verified-demonstration-present" },
  },
  {
    ruleId: "rule/reproduction",
    route: "reproduction",
    condition: { kind: "reproduction-present" },
  },
  {
    ruleId: "rule/expert-escalation",
    route: "expert-escalation",
    condition: { kind: "fallback" },
  },
];

/** Deterministic routing outcome for one `GapFacts` record. */
export interface GapClassification {
  readonly classificationDigest: string;
  readonly route: GapRouteName;
  readonly ruleId: string;
  readonly reason: GapRouteReason;
  readonly evaluatedRules: readonly string[];
}

export function classifyGap(facts: GapFacts): GapClassification {
  const evaluatedRules: string[] = [];
  const unmatchedRoutes: GapRouteName[] = [];
  for (const rule of GAP_ROUTING_RULES) {
    evaluatedRules.push(rule.ruleId);
    if (!conditionMatches(rule.condition, facts)) {
      if (rule.condition.kind !== "fallback") {
        unmatchedRoutes.push(rule.route);
      }
      continue;
    }
    const reason = buildReason(rule.route, facts, unmatchedRoutes);
    const core = {
      route: rule.route,
      ruleId: rule.ruleId,
      reason,
      evaluatedRules,
    };
    return {
      classificationDigest: digestRecord("gap-classification", core),
      ...core,
    };
  }
  throw new GapRoutingError("routing table exhausted without a fallback match");
}

function conditionMatches(
  condition: GapRouteCondition,
  facts: GapFacts,
): boolean {
  switch (condition.kind) {
    case "environment-defects-present":
      return facts.environmentDefects.length >= condition.minimumDefects;
    case "missing-evidence-present":
      return facts.missingEvidenceKinds.length >= condition.minimumKinds;
    case "covering-capability-present":
      return facts.coveringCapability !== null;
    case "verified-demonstration-present":
      return facts.verifiedDemonstration !== null;
    case "reproduction-present":
      return facts.reproduction !== null;
    case "fallback":
      return true;
  }
}

function buildReason(
  route: GapRouteName,
  facts: GapFacts,
  unmatchedRoutes: readonly GapRouteName[],
): GapRouteReason {
  switch (route) {
    case "environment-repair":
      return {
        kind: "environment-repair",
        defectKinds: facts.environmentDefects.map(
          (defect) => defect.defectKind,
        ),
        defectCount: facts.environmentDefects.length,
      };
    case "evidence-request":
      return {
        kind: "evidence-request",
        missingEvidenceKinds: [...facts.missingEvidenceKinds],
      };
    case "existing-capability": {
      const covering = facts.coveringCapability;
      if (covering === null) {
        throw new GapRoutingError(
          "existing-capability route without a covering capability",
        );
      }
      return {
        kind: "existing-capability",
        coveringCapabilityId: covering.capabilityId,
        coveringCapabilityDigest: covering.capabilityDigest,
      };
    }
    case "demonstration": {
      const demonstration = facts.verifiedDemonstration;
      if (demonstration === null) {
        throw new GapRoutingError(
          "demonstration route without a verified demonstration",
        );
      }
      return {
        kind: "demonstration",
        demonstrationDigest: demonstration.demonstrationDigest,
        episodeId: demonstration.episodeId,
      };
    }
    case "reproduction": {
      const reproduction = facts.reproduction;
      if (reproduction === null) {
        throw new GapRoutingError(
          "reproduction route without a reproduction fact",
        );
      }
      return {
        kind: "reproduction",
        reproductionDigest: reproduction.reproductionDigest,
        reproducedInEpisodes: [...reproduction.reproducedInEpisodes],
      };
    }
    case "expert-escalation":
      return {
        kind: "expert-escalation",
        exhaustedRoutes: [...unmatchedRoutes],
      };
  }
}

/** A recorded capability gap: evidence refs + deterministic classification. */
export interface CapabilityGap {
  readonly gapId: string;
  readonly recordedInEpoch: string;
  readonly target: CapabilityRef;
  readonly intervention: InterventionRef;
  readonly classification: GapClassification;
  readonly factsDigest: string;
  readonly notes: readonly string[];
}

export function recordGap(
  facts: GapFacts,
  notes: readonly string[] = [],
): CapabilityGap {
  validateGapFacts(facts);
  const classification = classifyGap(facts);
  const factsDigest = digestRecord("gap-facts", facts);
  const core = {
    factsDigest,
    classificationDigest: classification.classificationDigest,
    recordedInEpoch: facts.occurredInEpoch,
    notes: [...notes],
  };
  return {
    gapId: digestRecord("capability-gap", core),
    recordedInEpoch: facts.occurredInEpoch,
    target: facts.targetCapability,
    intervention: facts.intervention,
    classification,
    factsDigest,
    notes: [...notes],
  };
}

function validateGapFacts(facts: GapFacts): void {
  if (!isValidDigest(facts.targetCapability.capabilityDigest)) {
    throw new InvalidRecordError("target capability digest must be 64-hex");
  }
  if (facts.targetCapability.capabilityId.trim() === "") {
    throw new InvalidRecordError("target capability id must not be blank");
  }
  if (!isValidDigest(facts.intervention.interventionDigest)) {
    throw new InvalidRecordError("intervention digest must be 64-hex");
  }
  if (facts.intervention.episodeId.trim() === "") {
    throw new InvalidRecordError("intervention episode id must not be blank");
  }
  if (facts.occurredInEpoch.trim() === "") {
    throw new InvalidRecordError("epoch reference must not be blank");
  }
  for (const defect of facts.environmentDefects) {
    if (!isValidDigest(defect.evidenceDigest)) {
      throw new InvalidRecordError(
        "environment defect evidence digest must be 64-hex",
      );
    }
  }
  const demonstration = facts.verifiedDemonstration;
  if (
    demonstration !== null &&
    !isValidDigest(demonstration.demonstrationDigest)
  ) {
    throw new InvalidRecordError("demonstration digest must be 64-hex");
  }
  const reproduction = facts.reproduction;
  if (
    reproduction !== null &&
    !isValidDigest(reproduction.reproductionDigest)
  ) {
    throw new InvalidRecordError("reproduction digest must be 64-hex");
  }
}
