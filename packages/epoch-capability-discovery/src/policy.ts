import { canonicalDigest, canonicalJSON, deepFreeze } from "./canonical.js";
import type {
  CapabilityRole,
  Digest,
  DiscoveryPolicy,
  DiscoveryRule,
  PromotionThresholds,
  RuleId,
} from "./types.js";

/** Digest of the canonical serialization of a policy. */
export function policyDigest(policy: DiscoveryPolicy): Digest {
  return canonicalDigest(policy);
}

/** Structural validation of a discovery policy (throws with a precise message). */
export function validatePolicy(
  policy: unknown,
): asserts policy is DiscoveryPolicy {
  if (policy === null || typeof policy !== "object") {
    throw new Error("validatePolicy: policy must be an object");
  }
  const p = policy as Record<string, unknown>;
  if (!Array.isArray(p.rules)) {
    throw new Error("validatePolicy: policy.rules must be an array");
  }
  if (!Array.isArray(p.enabledRuleIds)) {
    throw new Error("validatePolicy: policy.enabledRuleIds must be an array");
  }
  const known = new Set<string>();
  for (const rule of p.rules) {
    validateRule(rule, known);
  }
  for (const id of p.enabledRuleIds) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(
        "validatePolicy: enabledRuleIds entries must be non-empty strings",
      );
    }
    if (!known.has(id)) {
      throw new Error(
        `validatePolicy: enabled rule id "${id}" does not match any rule`,
      );
    }
  }
  validatePromotion(p.promotion);
  try {
    canonicalJSON(policy);
  } catch (error) {
    throw new Error(
      `validatePolicy: policy must be pure data (${(error as Error).message})`,
    );
  }
}

function validateRule(rule: unknown, known: Set<string>): void {
  if (rule === null || typeof rule !== "object") {
    throw new Error("validatePolicy: every rule must be an object");
  }
  const r = rule as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) {
    throw new Error("validatePolicy: rule.id must be a non-empty string");
  }
  if (known.has(r.id)) {
    throw new Error(`validatePolicy: duplicate rule id "${r.id}"`);
  }
  known.add(r.id);
  if (typeof r.description !== "string") {
    throw new Error(
      `validatePolicy: rule "${r.id}" description must be a string`,
    );
  }
  const weight = r.weight;
  if (
    typeof weight !== "number" ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 1
  ) {
    throw new Error(
      `validatePolicy: rule "${r.id}" weight must be a number in (0, 1]`,
    );
  }
  if (r.match === null || typeof r.match !== "object") {
    throw new Error(`validatePolicy: rule "${r.id}" match must be an object`);
  }
  const m = r.match as Record<string, unknown>;
  if (
    m.evidenceKind !== undefined &&
    (typeof m.evidenceKind !== "string" || m.evidenceKind.length === 0)
  ) {
    throw new Error(
      `validatePolicy: rule "${r.id}" match.evidenceKind must be a non-empty string when present`,
    );
  }
  if (
    m.subjectKind !== undefined &&
    (typeof m.subjectKind !== "string" || m.subjectKind.length === 0)
  ) {
    throw new Error(
      `validatePolicy: rule "${r.id}" match.subjectKind must be a non-empty string when present`,
    );
  }
  if (m.payloadDigestIn !== undefined && !Array.isArray(m.payloadDigestIn)) {
    throw new Error(
      `validatePolicy: rule "${r.id}" match.payloadDigestIn must be an array when present`,
    );
  }
  if (
    m.minOccurrences !== undefined &&
    (typeof m.minOccurrences !== "number" ||
      !Number.isInteger(m.minOccurrences) ||
      m.minOccurrences < 1)
  ) {
    throw new Error(
      `validatePolicy: rule "${r.id}" match.minOccurrences must be a positive integer when present`,
    );
  }
  if (r.candidate === null || typeof r.candidate !== "object") {
    throw new Error(
      `validatePolicy: rule "${r.id}" candidate must be an object`,
    );
  }
  const c = r.candidate as Record<string, unknown>;
  if (typeof c.roleId !== "string" || c.roleId.length === 0) {
    throw new Error(
      `validatePolicy: rule "${r.id}" candidate.roleId must be a non-empty string`,
    );
  }
  if (c.scope === null || typeof c.scope !== "object") {
    throw new Error(
      `validatePolicy: rule "${r.id}" candidate.scope must be an object`,
    );
  }
  const s = c.scope as Record<string, unknown>;
  if (
    !Array.isArray(s.appliesTo) ||
    s.appliesTo.some((k) => typeof k !== "string" || k.length === 0)
  ) {
    throw new Error(
      `validatePolicy: rule "${r.id}" candidate.scope.appliesTo must be an array of non-empty strings`,
    );
  }
  if (s.description !== undefined && typeof s.description !== "string") {
    throw new Error(
      `validatePolicy: rule "${r.id}" candidate.scope.description must be a string when present`,
    );
  }
}

function validatePromotion(
  promotion: unknown,
): asserts promotion is PromotionThresholds {
  if (promotion === null || typeof promotion !== "object") {
    throw new Error("validatePolicy: policy.promotion must be an object");
  }
  const t = promotion as Record<string, unknown>;
  const minEvidenceCount = t.minEvidenceCount;
  if (
    typeof minEvidenceCount !== "number" ||
    !Number.isInteger(minEvidenceCount) ||
    minEvidenceCount < 1
  ) {
    throw new Error(
      "validatePolicy: promotion.minEvidenceCount must be a positive integer",
    );
  }
  const minConfidence = t.minConfidence;
  if (
    typeof minConfidence !== "number" ||
    !Number.isFinite(minConfidence) ||
    minConfidence < 0 ||
    minConfidence >= 1
  ) {
    throw new Error(
      "validatePolicy: promotion.minConfidence must be a number in [0, 1)",
    );
  }
  const maxConfidence = t.maxConfidence;
  if (
    typeof maxConfidence !== "number" ||
    !Number.isFinite(maxConfidence) ||
    maxConfidence < minConfidence ||
    maxConfidence > 1
  ) {
    throw new Error(
      "validatePolicy: promotion.maxConfidence must be a number in [minConfidence, 1]",
    );
  }
}

/** Builds a validated, frozen, canonically-normalized policy. */
export function definePolicy(input: {
  rules: readonly DiscoveryRule[];
  enabledRuleIds?: readonly RuleId[];
  promotion?: PromotionThresholds;
}): DiscoveryPolicy {
  const policy: DiscoveryPolicy = {
    rules: input.rules,
    enabledRuleIds: input.enabledRuleIds ?? input.rules.map((rule) => rule.id),
    promotion: input.promotion ?? DEFAULT_PROMOTION_THRESHOLDS,
  };
  validatePolicy(policy);
  return deepFreeze(JSON.parse(canonicalJSON(policy))) as DiscoveryPolicy;
}

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = deepFreeze({
  minEvidenceCount: 3,
  minConfidence: 0.5,
  maxConfidence: 1,
});

/** Provider-neutral starter role catalog. Model names NEVER define roles. */
export const NEUTRAL_CAPABILITY_ROLES: readonly CapabilityRole[] = deepFreeze([
  {
    id: "capability.role/solution-synthesis",
    label: "Solution synthesis",
    description:
      "Declares that observed evidence suggests a capability for synthesizing solution candidates for a class of problems.",
    domain: "construction",
  },
  {
    id: "capability.role/verification-review",
    label: "Verification review",
    description:
      "Declares that observed evidence suggests a capability for reviewing and verifying candidate work products.",
    domain: "verification",
  },
  {
    id: "capability.role/interaction-clarification",
    label: "Interaction clarification",
    description:
      "Declares that observed evidence suggests a capability for clarifying ambiguous requests through interaction.",
    domain: "interaction",
  },
]);

/** A starter provider-neutral policy (all rules enabled, default thresholds). */
export function defaultDiscoveryPolicy(): DiscoveryPolicy {
  return definePolicy({
    rules: [
      {
        id: "rule/completed-tasks-suggest-solution-synthesis",
        description:
          "Repeatedly completed tasks suggest a solution-synthesis capability for that class of problems.",
        match: { evidenceKind: "task.completed" },
        candidate: {
          roleId: "capability.role/solution-synthesis",
          scope: { appliesTo: ["task"] },
        },
        weight: 0.5,
      },
      {
        id: "rule/failed-tasks-suggest-verification-review",
        description:
          "Repeatedly failed tasks suggest a verification-review capability should be declared.",
        match: { evidenceKind: "task.failed" },
        candidate: {
          roleId: "capability.role/verification-review",
          scope: { appliesTo: ["task"] },
        },
        weight: 0.4,
      },
      {
        id: "rule/observed-interactions-suggest-interaction-clarification",
        description:
          "Repeated clarifying interactions suggest an interaction-clarification capability.",
        match: { evidenceKind: "interaction.observed" },
        candidate: {
          roleId: "capability.role/interaction-clarification",
          scope: { appliesTo: ["task", "problem"] },
        },
        weight: 0.3,
      },
    ],
  });
}
