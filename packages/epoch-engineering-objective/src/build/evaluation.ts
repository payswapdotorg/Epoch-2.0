import { digestCanonical } from "../canonical.js";
import { kebabId } from "../validate.js";
import type {
  AbundanceEvaluation,
  AbundanceEvaluationInput,
  ClaimableCostDelta,
  CompletionShare,
  InterventionProgressEntry,
} from "../types/evaluation.js";
import type { CompletionRecord, VerifiedQualityMetric } from "../types/completion.js";
import type { BaselineMeasure, InterventionMeasure } from "../types/measures.js";
import type { ProvenanceVerification } from "../types/end-to-end.js";
import { sameTaskFamily } from "./denominators.js";
import { verifiedQualityShare } from "./completion.js";
import { evaluateInterventionProgress } from "./measures.js";
import { summarizeSafetyRegressions } from "./safety.js";
import { computeCapabilityReuseRate, computeEscalationRate } from "./rates.js";
import { evaluateAbundanceClaim } from "./variance.js";
import { verifyEndToEndCase } from "./end-to-end.js";

function selectBaselineForIntervention(
  intervention: InterventionMeasure,
  baselines: readonly BaselineMeasure[],
  completions: readonly CompletionRecord[]
): BaselineMeasure | null {
  const familyBaselines = baselines.filter((b) =>
    sameTaskFamily(b.familyRef, intervention.familyRef)
  );
  const taskBaseline = familyBaselines.find(
    (b) => b.scope.scope === "task" && b.scope.taskId === intervention.taskId
  );
  if (taskBaseline !== undefined) {
    return taskBaseline;
  }
  const completion = completions.find(
    (c) =>
      c.taskId === intervention.taskId &&
      sameTaskFamily(c.familyRef, intervention.familyRef)
  );
  if (completion !== undefined) {
    const classBaseline = familyBaselines.find(
      (b) =>
        b.scope.scope === "task-class" &&
        b.scope.taskClassId === completion.taskClassId
    );
    if (classBaseline !== undefined) {
      return classBaseline;
    }
  }
  return familyBaselines.find((b) => b.scope.scope === "task-family") ?? null;
}

/**
 * The composed abundance evaluation: one deterministic machine over the
 * full input bundle. Family scoping follows the denominator's family;
 * foreign-family interventions/variances belong to their own family's
 * evaluation. Human/arena tasks stay visible in every output they touch.
 */
export function evaluateAbundance(
  input: AbundanceEvaluationInput
): AbundanceEvaluation {
  const evaluationId = kebabId("evaluateAbundance.evaluationId", input.evaluationId);
  const familyRef = input.denominator.familyRef;
  const includedClasses = new Set(
    input.denominator.includedTaskClasses.map((rule) => rule.classId)
  );

  const excludedTaskIds: string[] = [];
  let completedInDenominator = 0;
  let inDenominator = 0;
  for (const completion of input.completions) {
    if (
      sameTaskFamily(completion.familyRef, familyRef) &&
      includedClasses.has(completion.taskClassId)
    ) {
      inDenominator += 1;
      if (completion.outcome === "completed") {
        completedInDenominator += 1;
      }
    } else {
      excludedTaskIds.push(completion.taskId);
    }
  }
  const completion: CompletionShare = {
    kind: "completion-share",
    total: input.completions.length,
    completed: completedInDenominator,
    inDenominator,
    excludedTaskIds,
  };

  const familyMetrics = input.qualityMetrics.filter((metric) =>
    sameTaskFamily(metric.familyRef, familyRef)
  );
  const verifiedQuality = verifiedQualityShare(familyMetrics, input.qualityAcceptance);

  const escalationRate = computeEscalationRate(
    `${evaluationId}-escalation-rate`,
    familyRef,
    input.executions
  );
  const capabilityReuseRate = computeCapabilityReuseRate(
    `${evaluationId}-capability-reuse-rate`,
    familyRef,
    input.reuseObservations,
    input.executions
  );

  const qualityByTask = new Map<string, VerifiedQualityMetric>();
  for (const metric of familyMetrics) {
    if (!qualityByTask.has(metric.taskId)) {
      qualityByTask.set(metric.taskId, metric);
    }
  }
  const interventionProgress: InterventionProgressEntry[] = [];
  for (const intervention of input.interventions) {
    if (!sameTaskFamily(intervention.familyRef, familyRef)) {
      continue;
    }
    const baseline = selectBaselineForIntervention(
      intervention,
      input.baselines,
      input.completions
    );
    const pairedQuality = qualityByTask.get(intervention.taskId) ?? null;
    interventionProgress.push({
      taskId: intervention.taskId,
      progress: evaluateInterventionProgress({
        intervention,
        baseline,
        pairedQuality,
        acceptance: input.qualityAcceptance,
        safetyRegressions: input.safetyMeasures,
      }),
    });
  }

  const safety = summarizeSafetyRegressions(input.safetyMeasures, familyRef);

  const abundanceClaims = input.variances
    .filter((record) => sameTaskFamily(record.familyRef, familyRef))
    .map((record) => evaluateAbundanceClaim(record, input.qualityAcceptance));

  const deltas = new Map<
    string,
    { currencyCode: string; claimedReductionMinorUnits: number; claimCount: number }
  >();
  for (const claim of abundanceClaims) {
    if (claim.kind !== "lower-cost-claim") {
      continue;
    }
    const existing = deltas.get(claim.currencyCode);
    if (existing === undefined) {
      deltas.set(claim.currencyCode, {
        currencyCode: claim.currencyCode,
        claimedReductionMinorUnits: claim.claimedReductionMinorUnits,
        claimCount: 1,
      });
    } else {
      existing.claimedReductionMinorUnits += claim.claimedReductionMinorUnits;
      existing.claimCount += 1;
    }
  }
  const claimableCostDeltas: ClaimableCostDelta[] = [...deltas.values()].map(
    (delta) => ({ kind: "claimable-cost-delta", ...delta })
  );

  const endToEndProvenance: ProvenanceVerification =
    input.endToEndCase === null
      ? { ok: false, reason: "no end-to-end case was supplied", stageIndex: null }
      : verifyEndToEndCase(input.endToEndCase);

  if (input.limitations !== null) {
    if (input.endToEndCase === null) {
      throw new TypeError(
        "evaluateAbundance: a limitations report requires the end-to-end case it belongs to"
      );
    }
    if (
      input.limitations.caseRef.caseId !== input.endToEndCase.caseId ||
      input.limitations.caseRef.caseDigest !== input.endToEndCase.caseDigest
    ) {
      throw new TypeError(
        "evaluateAbundance: the limitations report does not reference the supplied end-to-end case"
      );
    }
  }

  const visibleNonAutomatedTaskIds: string[] = [];
  const visibleSeen = new Set<string>();
  for (const taskId of escalationRate.escalatedTaskIds) {
    if (!visibleSeen.has(taskId)) {
      visibleSeen.add(taskId);
      visibleNonAutomatedTaskIds.push(taskId);
    }
  }

  const inputDigest = digestCanonical(input);
  const preEvaluation: Omit<AbundanceEvaluation, "evaluationDigest"> = {
    kind: "abundance-evaluation",
    evaluationId,
    familyRef,
    denominator: input.denominator,
    completion,
    verifiedQuality,
    escalationRate,
    capabilityReuseRate,
    interventionProgress,
    safety,
    abundanceClaims,
    claimableCostDeltas,
    visibleNonAutomatedTaskIds,
    endToEndCase: input.endToEndCase,
    endToEndProvenance,
    limitations: input.limitations,
    inputDigest,
  };
  return { ...preEvaluation, evaluationDigest: digestCanonical(preEvaluation) };
}
