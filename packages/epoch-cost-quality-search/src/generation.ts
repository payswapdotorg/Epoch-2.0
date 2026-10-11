import { compareStrings } from "./internal/compare.js";
import { canonicalDigest, isSha256Hex } from "./internal/digest.js";
import {
  isNonEmptyString,
  isNonEmptyStringArray,
  isObject,
} from "./internal/guards.js";
import {
  composePredictedMetrics,
  type MetricCompositionIssue,
  type MetricReading,
} from "./metrics.js";
import {
  capabilityPredictionContribution,
  findCapability,
  prepareCapabilities,
  type CapabilityIssue,
  type RegisteredCapability,
} from "./capabilities.js";
import { requirementMetricIds, type RequirementSet } from "./requirements.js";

/**
 * Solution identity and alternative generation (W033).
 *
 * Identity law: a baseline and a candidate carry SEPARATE revision
 * identity — both are digest refs to world revisions, and every candidate
 * explicitly names the baseline revision it derives from. A candidate is
 * therefore never a silent replacement of the baseline.
 *
 * Composition law: alternatives are DATA composed from registered
 * capability declarations only. Generated candidates carry predicted
 * metrics composed deterministically (worst case) from the declarations of
 * their resolved capability refs; behavior is never invented.
 */

/** Digest reference to a world revision — an opaque identity anchor. */
export interface WorldRevisionRef {
  readonly worldId: string;
  readonly revisionDigest: string;
}

export interface SolutionBaseline {
  readonly solutionId: string;
  readonly name: string;
  readonly description: string;
  readonly worldRevision: WorldRevisionRef;
  readonly capabilityRefs: readonly string[];
  readonly notes: readonly string[];
}

export type CandidateDelta =
  | { readonly kind: "add-capability"; readonly capabilityId: string }
  | { readonly kind: "remove-capability"; readonly capabilityId: string }
  | {
      readonly kind: "replace-capability";
      readonly fromCapabilityId: string;
      readonly toCapabilityId: string;
    };

/** The baseline (and its exact revision) a candidate derives from. */
export interface BaselineRef {
  readonly solutionId: string;
  readonly revisionDigest: string;
}

export interface SolutionCandidate {
  readonly candidateId: string;
  readonly label: string;
  readonly description: string;
  readonly baselineRef: BaselineRef;
  /** This candidate's OWN revision identity — never the baseline's. */
  readonly worldRevision: WorldRevisionRef;
  readonly deltas: readonly CandidateDelta[];
  readonly capabilityRefs: readonly string[];
  readonly predictedMetrics: readonly MetricReading[];
  readonly metricIssues: readonly MetricCompositionIssue[];
}

export type GenerationIssue =
  | { readonly kind: "invalid-baseline"; readonly detail: string }
  | {
      readonly kind: "unknown-baseline-capability";
      readonly capabilityId: string;
    };

export interface GenerationResult {
  /** Candidates sorted by candidateId. */
  readonly candidates: readonly SolutionCandidate[];
  readonly issues: readonly GenerationIssue[];
  /** Intake issues from the capability registry (propagated, typed). */
  readonly registryIssues: readonly CapabilityIssue[];
}

interface Proposal {
  readonly candidateId: string;
  readonly label: string;
  readonly description: string;
  readonly deltas: readonly CandidateDelta[];
  readonly keepBaselineRevision: boolean;
}

/**
 * Apply deltas to the baseline refs in order; returns the sorted unique
 * result. Removing an absent ref is a no-op; replacing an absent ref acts
 * as an addition (documented, deterministic).
 */
export function resolveCapabilityRefs(
  baselineRefs: readonly string[],
  deltas: readonly CandidateDelta[],
): readonly string[] {
  const refs = new Set(baselineRefs);
  for (const delta of deltas) {
    switch (delta.kind) {
      case "add-capability":
        refs.add(delta.capabilityId);
        break;
      case "remove-capability":
        refs.delete(delta.capabilityId);
        break;
      case "replace-capability":
        refs.delete(delta.fromCapabilityId);
        refs.add(delta.toCapabilityId);
        break;
    }
  }
  return [...refs].sort(compareStrings);
}

/**
 * Deterministic proposal revision for a generated candidate: the same
 * world as the baseline, with a revision digest derived (SHA-256 over the
 * canonical proposal content). Derived identity — never a silent reuse of
 * the baseline's revision digest.
 */
export function deriveProposalRevision(
  baseline: SolutionBaseline,
  deltas: readonly CandidateDelta[],
  capabilityRefs: readonly string[],
): WorldRevisionRef {
  return {
    worldId: baseline.worldRevision.worldId,
    revisionDigest: canonicalDigest({
      kind: "w033-proposal-revision",
      baselineSolutionId: baseline.solutionId,
      baselineRevisionDigest: baseline.worldRevision.revisionDigest,
      deltas: deltas.map((delta) => ({ ...delta })),
      capabilityRefs: [...capabilityRefs],
    }),
  };
}

/** Content digest of a baseline record (canonical view, refs sorted). */
export function baselineContentDigest(baseline: SolutionBaseline): string {
  return canonicalDigest({
    kind: "solution-baseline",
    solutionId: baseline.solutionId,
    name: baseline.name,
    description: baseline.description,
    worldRevision: baseline.worldRevision,
    capabilityRefs: [...baseline.capabilityRefs].sort(compareStrings),
    notes: [...baseline.notes],
  });
}

/** Content digest of a candidate record, including composed predictions. */
export function candidateContentDigest(candidate: SolutionCandidate): string {
  return canonicalDigest({
    kind: "solution-candidate",
    candidateId: candidate.candidateId,
    baselineRef: candidate.baselineRef,
    worldRevision: candidate.worldRevision,
    deltas: candidate.deltas.map((delta) => ({ ...delta })),
    capabilityRefs: [...candidate.capabilityRefs],
    predictedMetrics: candidate.predictedMetrics.map((reading) => ({
      ...reading,
    })),
    metricIssues: candidate.metricIssues.map((issue) => ({ ...issue })),
  });
}

/**
 * Generate alternatives from the baseline, the requirement set and the
 * registered capability declarations:
 *
 * - an identity candidate (the baseline itself, zero deltas, openly
 *   carrying the baseline's revision — it is compared, never substituted);
 * - one add candidate per registered capability not already referenced;
 * - one replace candidate per (resolvable baseline ref, registered
 *   replacement) pair that shares at least one declared metric with the
 *   replaced capability OR declares a metric referenced by the
 *   requirements.
 *
 * Fully deterministic: identical inputs yield identical outputs.
 */
export function generateAlternatives(
  baseline: SolutionBaseline,
  requirements: RequirementSet,
  registeredCapabilities: readonly RegisteredCapability[],
): GenerationResult {
  const intake = prepareCapabilities(registeredCapabilities);
  const issues: GenerationIssue[] = [];
  const baselineDetail = baselineProblem(baseline);
  if (baselineDetail !== null) {
    return {
      candidates: [],
      issues: [{ kind: "invalid-baseline", detail: baselineDetail }],
      registryIssues: intake.issues,
    };
  }

  const baselineRefs = [...new Set(baseline.capabilityRefs)].sort(
    compareStrings,
  );
  const baselineRefSet = new Set(baselineRefs);
  for (const ref of baselineRefs) {
    if (findCapability(intake.capabilities, ref) === undefined) {
      issues.push({ kind: "unknown-baseline-capability", capabilityId: ref });
    }
  }
  issues.sort(compareGenerationIssues);

  const requirementMetrics = new Set(requirementMetricIds(requirements));
  const proposals: Proposal[] = [
    {
      candidateId: `${baseline.solutionId}::baseline`,
      label: "Baseline (as-is)",
      description: "The baseline solution itself, evaluated for comparison.",
      deltas: [],
      keepBaselineRevision: true,
    },
  ];

  for (const capability of intake.capabilities) {
    if (baselineRefSet.has(capability.capabilityId)) {
      continue;
    }
    proposals.push({
      candidateId: `${baseline.solutionId}::add:${capability.capabilityId}`,
      label: `Add ${capability.capabilityId}`,
      description: `Add registered capability ${capability.capabilityId} to the baseline.`,
      deltas: [
        { kind: "add-capability", capabilityId: capability.capabilityId },
      ],
      keepBaselineRevision: false,
    });
  }

  for (const ref of baselineRefs) {
    const current = findCapability(intake.capabilities, ref);
    if (current === undefined) {
      continue; // unknown refs cannot be overlap-checked; reported above
    }
    const currentMetrics = new Set(
      current.qualityAttributes.map((attribute) => attribute.metricId),
    );
    for (const replacement of intake.capabilities) {
      if (replacement.capabilityId === ref) {
        continue;
      }
      const overlaps = replacement.qualityAttributes.some(
        (attribute) =>
          currentMetrics.has(attribute.metricId) ||
          requirementMetrics.has(attribute.metricId),
      );
      if (!overlaps) {
        continue;
      }
      proposals.push({
        candidateId: `${baseline.solutionId}::replace:${ref}->${replacement.capabilityId}`,
        label: `Replace ${ref} -> ${replacement.capabilityId}`,
        description: `Replace baseline capability ${ref} with registered capability ${replacement.capabilityId}.`,
        deltas: [
          {
            kind: "replace-capability",
            fromCapabilityId: ref,
            toCapabilityId: replacement.capabilityId,
          },
        ],
        keepBaselineRevision: false,
      });
    }
  }

  const candidates = proposals
    .map((proposal) => buildCandidate(baseline, proposal, intake.capabilities))
    .sort((a, b) => compareStrings(a.candidateId, b.candidateId));
  return { candidates, issues, registryIssues: intake.issues };
}

function buildCandidate(
  baseline: SolutionBaseline,
  proposal: Proposal,
  registry: readonly RegisteredCapability[],
): SolutionCandidate {
  const capabilityRefs = resolveCapabilityRefs(
    baseline.capabilityRefs,
    proposal.deltas,
  );
  const contributions = capabilityRefs
    .map((ref) => findCapability(registry, ref))
    .filter(
      (capability): capability is RegisteredCapability =>
        capability !== undefined,
    )
    .map((capability) => capabilityPredictionContribution(capability));
  const composed = composePredictedMetrics(contributions);
  return {
    candidateId: proposal.candidateId,
    label: proposal.label,
    description: proposal.description,
    baselineRef: {
      solutionId: baseline.solutionId,
      revisionDigest: baseline.worldRevision.revisionDigest,
    },
    worldRevision: proposal.keepBaselineRevision
      ? baseline.worldRevision
      : deriveProposalRevision(baseline, proposal.deltas, capabilityRefs),
    deltas: proposal.deltas.map((delta) => ({ ...delta })),
    capabilityRefs,
    predictedMetrics: composed.readings,
    metricIssues: composed.issues,
  };
}

function baselineProblem(baseline: SolutionBaseline): string | null {
  if (!isObject(baseline)) {
    return "baseline must be an object";
  }
  if (!isNonEmptyString(baseline.solutionId)) {
    return "solutionId must be a non-empty string";
  }
  if (!isNonEmptyString(baseline.name)) {
    return "name must be a non-empty string";
  }
  if (!isNonEmptyString(baseline.description)) {
    return "description must be a non-empty string";
  }
  const revision: unknown = baseline.worldRevision;
  if (!isObject(revision)) {
    return "worldRevision must be an object";
  }
  const worldId: unknown = revision.worldId;
  const digest: unknown = revision.revisionDigest;
  if (!isNonEmptyString(worldId)) {
    return "worldRevision.worldId must be a non-empty string";
  }
  if (typeof digest !== "string" || !isSha256Hex(digest)) {
    return "worldRevision.revisionDigest must be lowercase hex SHA-256";
  }
  if (!isNonEmptyStringArray(baseline.capabilityRefs)) {
    return "capabilityRefs must be an array of non-empty strings";
  }
  if (!isNonEmptyStringArray(baseline.notes)) {
    return "notes must be an array of non-empty strings";
  }
  return null;
}

function compareGenerationIssues(
  a: GenerationIssue,
  b: GenerationIssue,
): number {
  const byKind = compareStrings(a.kind, b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  if (
    a.kind === "unknown-baseline-capability" &&
    b.kind === "unknown-baseline-capability"
  ) {
    return compareStrings(a.capabilityId, b.capabilityId);
  }
  return compareStrings(
    a.kind === "invalid-baseline" ? a.detail : "",
    b.kind === "invalid-baseline" ? b.detail : "",
  );
}
