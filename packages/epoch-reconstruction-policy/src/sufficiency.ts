/**
 * epoch-reconstruction-policy 充分性评估器。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md「Progressive
 * refinement」与验收点 4/5/7/8：
 *
 * 1. 收集 intent.evidence 与 profile.requiredInputs/optionalInputs 做类别匹配。
 * 2. 类别满足 ≠ 质量满足：证据存在但 inferenceTag 不在 acceptTags 内时，
 *    记为「质量缺口」（验收点 8 强制门）。
 * 3. 冲突证据（inferenceTag=disputed 或 conflictsWith 非空）按 profile 的
 *    blockOnConflict / uncertainty.requireConflictReconciliation 决策：
 *    - requireConflictReconciliation=true 且未调和 → INFORMATION_REQUESTED 或 BLOCKED。
 *    - blockOnConflict=true → 直接 BLOCKED（如 structural 的 load）。
 * 4. 强制门缺失且 blockOnMissingMandatory=true → BLOCKED。
 * 5. 强制门缺失且 blockOnMissingMandatory=false → INFORMATION_REQUESTED（如 feasibility）。
 * 6. 可选门缺失 → 仅记为缺口，状态保持 READY/CONDITIONALLY_READY。
 * 7. 已满足但带推断/默认（acceptTags 含 inferred/defaulted） → CONDITIONALLY_READY。
 * 8. 推断/默认几何永不被静默提升为确认事实：satisfied 项的 inferenceTag 严格
 *    保留证据原标签（验收点 8）。
 *
 * 评估器不调用任何引擎/渲染器；纯函数（输入 intent + profile → 输出 assessment）。
 */
import type {
  EvidenceDescriptor,
  ProfileInputRequirement,
  ReconstructionIntent,
  ReconstructionProfile,
} from "./contract.ts";
import { isConfirmableProvenance } from "./contract.ts";
import type {
  EvidenceGap,
  FitnessState,
  InformationRequest,
  SatisfiedInput,
  SufficiencyAssessment,
} from "./fitness.ts";
import { rankInformationRequests } from "./voi.ts";

/** 单个输入要求的评估结果。 */
interface RequirementEvaluation {
  readonly requirement: ProfileInputRequirement;
  readonly matchingEvidence: readonly EvidenceDescriptor[];
  readonly satisfied: boolean;
  readonly gap?: EvidenceGap;
  readonly satisfiedEntry?: SatisfiedInput;
  readonly hasConflict: boolean;
  readonly qualityShortfall: boolean;
}

/**
 * 评估一个输入要求：从 evidence 中找匹配类别，判定质量与冲突。
 */
function evaluateRequirement(
  requirement: ProfileInputRequirement,
  evidence: readonly EvidenceDescriptor[],
): RequirementEvaluation {
  const matching = evidence.filter((e) => e.kind === requirement.kind);
  const hasConflict = matching.some(
    (e) =>
      e.inferenceTag === "disputed" ||
      (e.conflictsWith !== undefined && e.conflictsWith.length > 0),
  );
  // 质量满足：至少一条匹配证据的 inferenceTag 在 acceptTags 内。
  const qualityMatch = matching.filter((e) => requirement.acceptTags.includes(e.inferenceTag));
  const qualityShortfall = matching.length > 0 && qualityMatch.length === 0;
  // coverage 满足：若 coverageRequired，至少一条匹配证据携带 coverage 字段。
  let coverageOk = true;
  if (requirement.coverageRequired) {
    coverageOk = qualityMatch.some((e) => e.coverage !== undefined && e.coverage.length > 0);
  }
  const lastObserved = matching.length > 0 ? matching[matching.length - 1]?.provenance : undefined;
  const satisfied = qualityMatch.length > 0 && coverageOk && !hasConflict;

  if (satisfied) {
    // 取第一条质量满足的证据作为 satisfied 记录（保留原 inferenceTag——验收点 8）。
    const chosen = qualityMatch[0];
    if (chosen === undefined) {
      // 不可能：satisfied 隐含 qualityMatch.length>0，但为 noUncheckedIndexedAccess 收敛。
      const fallbackGap: EvidenceGap = {
        kind: requirement.kind,
        inferenceTag: "unknown",
        required: requirement.required,
        reason: `internal: qualityMatch[0] undefined for "${requirement.kind}"`,
      };
      return {
        requirement,
        matchingEvidence: matching,
        satisfied: false,
        gap: fallbackGap,
        hasConflict: false,
        qualityShortfall: false,
      };
    }
    return {
      requirement,
      matchingEvidence: matching,
      satisfied: true,
      hasConflict: false,
      qualityShortfall: false,
      satisfiedEntry: {
        kind: requirement.kind,
        evidenceId: chosen.id,
        inferenceTag: chosen.inferenceTag,
        coverage: chosen.coverage,
      },
    };
  }

  // 缺口
  let inferenceTag: EvidenceDescriptor["inferenceTag"] = "unknown";
  let reason = `no evidence of kind "${requirement.kind}"`;
  if (hasConflict) {
    inferenceTag = "disputed";
    reason = `conflicting evidence for "${requirement.kind}" requires reconciliation`;
  } else if (qualityShortfall) {
    // 取第一条匹配证据的标签作为「现状」标签
    const firstMatch = matching[0];
    inferenceTag = firstMatch === undefined ? "unknown" : firstMatch.inferenceTag;
    reason = `evidence for "${requirement.kind}" present but inferenceTag "${inferenceTag}" not in acceptTags [${requirement.acceptTags.join(", ")}]`;
  } else if (matching.length === 0) {
    inferenceTag = "unknown";
    reason = `no evidence of kind "${requirement.kind}"`;
  }
  const gap: EvidenceGap = {
    kind: requirement.kind,
    inferenceTag,
    required: requirement.required,
    reason,
    ...(lastObserved !== undefined ? { lastObservedProvenance: lastObserved } : {}),
  };
  return {
    requirement,
    matchingEvidence: matching,
    satisfied: false,
    gap,
    hasConflict,
    qualityShortfall,
  };
}

/**
 * 评估 intent + profile 的充分性。
 *
 * 返回 SufficiencyAssessment（带 gaps/satisfied/requests/appliedBounds/safetyCritical）。
 * 纯函数：不调用引擎/渲染器/网络/世界模型写回。
 */
export function assessSufficiency(
  intent: ReconstructionIntent,
  profile: ReconstructionProfile,
): SufficiencyAssessment {
  const evidence = intent.evidence;
  const requiredEvals = profile.requiredInputs.map((req) => evaluateRequirement(req, evidence));
  const optionalEvals = profile.optionalInputs.map((req) => evaluateRequirement(req, evidence));

  const gaps: EvidenceGap[] = [];
  const satisfied: SatisfiedInput[] = [];
  const requestKinds = new Set<string>();

  for (const ev of requiredEvals) {
    if (ev.satisfied && ev.satisfiedEntry) {
      satisfied.push(ev.satisfiedEntry);
    } else if (ev.gap) {
      gaps.push(ev.gap);
      requestKinds.add(ev.gap.kind);
    }
  }
  for (const ev of optionalEvals) {
    if (ev.satisfied && ev.satisfiedEntry) {
      satisfied.push(ev.satisfiedEntry);
    } else if (ev.gap) {
      // 可选缺口仅记录，不触发请求（除非含冲突且 profile 要求调和）
      gaps.push(ev.gap);
      if (ev.hasConflict && profile.uncertainty.requireConflictReconciliation) {
        requestKinds.add(ev.gap.kind);
      }
    }
  }

  // 判定 fitness state
  const safetyCritical =
    intent.consequenceOfError === "high" || intent.requestedFidelity === "analytical";
  const mandatoryMissing = requiredEvals.some((ev) => !ev.satisfied);
  const hasConfirmedSatisfied = satisfied.some((s) => isConfirmableProvenance(s.inferenceTag));
  const allSatisfiedInferredOrDefaulted =
    satisfied.length > 0 &&
    satisfied.every((s) => s.inferenceTag === "inferred" || s.inferenceTag === "defaulted");

  let state: FitnessState;
  if (mandatoryMissing && profile.blockOnMissingMandatory) {
    // 强制门缺失且 profile 要求阻塞 → BLOCKED
    // 但若该缺口仅是「冲突未调和」且 profile 允许调和 → INFORMATION_REQUESTED
    const onlyReconciliationGaps = requiredEvals
      .filter((ev) => !ev.satisfied)
      .every((ev) => ev.hasConflict && !ev.requirement.blockOnConflict);
    if (onlyReconciliationGaps && profile.uncertainty.requireConflictReconciliation) {
      state = "INFORMATION_REQUESTED";
    } else {
      state = "BLOCKED";
    }
  } else if (mandatoryMissing) {
    // 强制门缺失但 profile 允许信息请求 → INFORMATION_REQUESTED
    state = "INFORMATION_REQUESTED";
  } else if (allSatisfiedInferredOrDefaulted) {
    // 强制门全部通过，但所有已满足项均为推断/默认（无 confirmed/measured）：
    // 可在标注边界内进行，但不构成 READY（验收点 8：推断/默认不得作为确认依据）。
    state = "CONDITIONALLY_READY";
  } else if (hasConfirmedSatisfied) {
    // 强制门通过且至少一项为 confirmed/measured → READY。
    // 注意：可选门缺失仅记为缺口（gaps 已记录），不降级状态——
    // 可选门字面意义是「可选」，缺失不阻止任务进行（spec「READY: mandatory
    // inputs and validation gates pass for the named task」）。
    state = "READY";
  } else if (satisfied.length > 0) {
    state = "CONDITIONALLY_READY";
  } else {
    // 无证据也无缺口（profile 无 required/optional）：READY
    state = "READY";
  }

  // 构建信息请求（VOI 排序）
  const candidateRequests: InformationRequest[] = [];
  for (const kind of requestKinds) {
    const req =
      profile.requiredInputs.find((r) => r.kind === kind) ??
      profile.optionalInputs.find((r) => r.kind === kind);
    if (!req) continue;
    candidateRequests.push({
      kind,
      reason: `missing or insufficient evidence for "${kind}" under profile "${profile.id}"`,
      decisionImpactScore: scoreDecisionImpact(req, intent, profile),
      estimatedCost: estimateCost(req, profile),
    });
  }
  const requests = rankInformationRequests(candidateRequests);

  return {
    state,
    profileId: profile.id,
    taskId: intent.taskId,
    projectId: intent.projectId,
    gaps,
    satisfied,
    requests,
    appliedBounds: {
      allowedOutputKinds: profile.outputBounds.allowedOutputKinds,
      forbidOutputKinds: profile.outputBounds.forbidOutputKinds,
      explicitUnknowns: profile.outputBounds.explicitUnknowns,
      requiredAssumptionTags: profile.outputBounds.requiredAssumptionTags,
    },
    safetyCritical,
  };
}

/**
 * 简单文档化的决策影响评分（0..1）。
 *
 * 评分逻辑（诚实声明：这是简化的启发式，不是统计 VOI）：
 * - required 输入的基础分 0.6（强制门缺失通常改变决策）。
 * - optional 输入的基础分 0.2（通常不改变主决策，但可能改善结果）。
 * - consequenceOfError=high 时 ×1.3（安全关键任务缺证据更可能改变决策）。
 * - requestedFidelity=analytical 时 ×1.2（分析级对证据更敏感）。
 * - conflict 类缺口（disputed）额外 +0.15（冲突直接改变结论）。
 * - 最终裁剪到 [0,1]。
 */
function scoreDecisionImpact(
  req: ProfileInputRequirement,
  intent: ReconstructionIntent,
  profile: ReconstructionProfile,
): number {
  let base = req.required ? 0.6 : 0.2;
  if (intent.consequenceOfError === "high") base *= 1.3;
  if (intent.requestedFidelity === "analytical") base *= 1.2;
  if (profile.uncertainty.requireConflictReconciliation && req.blockOnConflict) base += 0.15;
  return Math.max(0, Math.min(1, base));
}

/**
 * 简单文档化的获取成本估计（0..1）。
 *
 * 评分逻辑（简化启发式）：
 * - 默认 0.5（中等成本：需要一次现场/图纸查阅）。
 * - 含 lastObservedProvenance 的缺口成本较低（已知来源，复采便宜）→ 0.3。
 * - coverageRequired 的缺口成本较高（需要系统覆盖，非单点）→ 0.7。
 */
function estimateCost(req: ProfileInputRequirement, profile: ReconstructionProfile): number {
  if (req.coverageRequired) return 0.7;
  if (profile.uncertainty.requireConflictReconciliation && req.blockOnConflict) return 0.6;
  return 0.5;
}
