/**
 * epoch-reconstruction-policy 适应度状态：READY / CONDITIONALLY_READY / BLOCKED /
 * INFORMATION_REQUESTED。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md「Fitness
 * states」与验收点 4/5/7：
 *
 * - READY：强制输入与验证门通过（且证据质量满足 acceptTags）。
 * - CONDITIONALLY_READY：可在附带的假设/边界内进行；缺口保持可见且带溯源。
 * - BLOCKED：事实/约束阻止可靠/安全工作（强制门缺失或质量不达标且不允许信息请求）。
 * - INFORMATION_REQUESTED：下一步目标证据正在等待响应（VOI 排序后的请求）。
 *
 * 缺失/冲突证据保持可见且带溯源（验收点 5）；推断/默认几何不被静默提升为
 * 确认事实（验收点 8）由 evidenceGaps 中的 inferenceTag 显式承载。
 */
import type { EvidenceProvenance, InferenceProvenanceTag } from "./contract.ts";
import { isEvidenceProvenance, isInferenceProvenanceTag } from "./contract.ts";

export const FITNESS_STATES = [
  "READY",
  "CONDITIONALLY_READY",
  "BLOCKED",
  "INFORMATION_REQUESTED",
] as const;
export type FitnessState = (typeof FITNESS_STATES)[number];

export const FITNESS_STATE_SET: ReadonlySet<string> = new Set<string>(FITNESS_STATES);

export function isFitnessState(value: unknown): value is FitnessState {
  return typeof value === "string" && FITNESS_STATE_SET.has(value);
}

/**
 * 证据缺口：一个未满足的输入要求。
 *
 * 验收点 5：缺口保持可见且带溯源。`lastObservedProvenance` 携带「曾经查看过的
 * 最近来源 + 时间戳」（即便现状为 unknown，也保留来源历史）；`inferenceTag`
 * 表达该缺口的推断状态（unknown=从未观测；disputed=多源冲突未调和；
 * inferred=有推断但 profile 不接受；defaulted=有默认但 profile 不接受）。
 */
export interface EvidenceGap {
  /** 缺失/不满足的输入要求类别（与 ProfileInputRequirement.kind 对应）。 */
  readonly kind: string;
  /** 该缺口的推断标签（unknown/disputed/inferred/defaulted）。 */
  readonly inferenceTag: InferenceProvenanceTag;
  /** 是否为强制门缺失（true→BLOCKED 或 INFORMATION_REQUESTED；false→CONDITIONALLY_READY）。 */
  readonly required: boolean;
  /** 缺失原因的人类可读说明。 */
  readonly reason: string;
  /** 曾经查看过的最近来源 + 时间戳（如可用；缺失证据仍保留来源历史）。 */
  readonly lastObservedProvenance?: EvidenceProvenance;
}

export function isEvidenceGap(value: unknown): value is EvidenceGap {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.kind !== "string" || candidate.kind.length === 0) return false;
  if (!isInferenceProvenanceTag(candidate.inferenceTag)) return false;
  if (typeof candidate.required !== "boolean") return false;
  if (typeof candidate.reason !== "string" || candidate.reason.length === 0) return false;
  if (candidate.lastObservedProvenance !== undefined) {
    if (!isEvidenceProvenance(candidate.lastObservedProvenance)) return false;
  }
  return true;
}

/**
 * 已满足的输入：profile 评估后认为通过的证据类别记录（用于结果溯源）。
 */
export interface SatisfiedInput {
  readonly kind: string;
  readonly evidenceId: string;
  readonly inferenceTag: InferenceProvenanceTag;
  readonly coverage?: string;
}

export function isSatisfiedInput(value: unknown): value is SatisfiedInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.kind !== "string" || candidate.kind.length === 0) return false;
  if (typeof candidate.evidenceId !== "string" || candidate.evidenceId.length === 0) return false;
  if (!isInferenceProvenanceTag(candidate.inferenceTag)) return false;
  if (candidate.coverage !== undefined && typeof candidate.coverage !== "string") return false;
  return true;
}

/**
 * 信息请求：当 fitness 为 INFORMATION_REQUESTED 时，按 VOI 排序的下一步证据请求。
 *
 * 验收点 7：sufficiency 在任务变化时重算，且只请求「可能改变决策」的证据。
 * `decisionImpactScore` 是该请求的预期决策改变评分（简单文档化评分，
 * 见 voi.ts）；`estimatedCost` 是获取该证据的相对成本（0..1，可选）；
 * `netVoI = decisionImpactScore * (1 - estimatedCost)` 用于排序。
 */
export interface InformationRequest {
  readonly kind: string;
  readonly reason: string;
  readonly decisionImpactScore: number;
  readonly estimatedCost: number;
  readonly requestedProvenanceHint?: EvidenceProvenance;
}

export function isInformationRequest(value: unknown): value is InformationRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.kind !== "string" || candidate.kind.length === 0) return false;
  if (typeof candidate.reason !== "string" || candidate.reason.length === 0) return false;
  if (
    typeof candidate.decisionImpactScore !== "number" ||
    !Number.isFinite(candidate.decisionImpactScore) ||
    candidate.decisionImpactScore < 0 ||
    candidate.decisionImpactScore > 1
  ) {
    return false;
  }
  if (
    typeof candidate.estimatedCost !== "number" ||
    !Number.isFinite(candidate.estimatedCost) ||
    candidate.estimatedCost < 0 ||
    candidate.estimatedCost > 1
  ) {
    return false;
  }
  if (candidate.requestedProvenanceHint !== undefined) {
    if (!isEvidenceProvenance(candidate.requestedProvenanceHint)) return false;
  }
  return true;
}

/**
 * Sufficiency 评估结果：fitness state + 缺口 + 已满足项 + 信息请求 + 适用边界。
 *
 * 验收点 5/7/8 的载体：gaps 与 requests 均带溯源；appliedBounds 显式列出
 * profile 强加的输出边界（如「仅概念级，未知保留为区间」），防止越权结论。
 */
export interface SufficiencyAssessment {
  readonly state: FitnessState;
  readonly profileId: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly gaps: readonly EvidenceGap[];
  readonly satisfied: readonly SatisfiedInput[];
  readonly requests: readonly InformationRequest[];
  /** 适用边界（profile.outputBounds 的拷贝 + 评估时叠加的 task 约束）。 */
  readonly appliedBounds: {
    readonly allowedOutputKinds: readonly string[];
    readonly forbidOutputKinds: readonly string[];
    readonly explicitUnknowns: readonly string[];
    readonly requiredAssumptionTags: readonly string[];
  };
  /** 评估时是否触发了不可降级的安全/合规门（consequenceOfError=high 时的标记）。 */
  readonly safetyCritical: boolean;
}

export function isSufficiencyAssessment(value: unknown): value is SufficiencyAssessment {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isFitnessState(candidate.state)) return false;
  if (typeof candidate.profileId !== "string" || candidate.profileId.length === 0) return false;
  if (typeof candidate.taskId !== "string" || candidate.taskId.length === 0) return false;
  if (typeof candidate.projectId !== "string" || candidate.projectId.length === 0) return false;
  if (!Array.isArray(candidate.gaps)) return false;
  if (!candidate.gaps.every((item) => isEvidenceGap(item))) return false;
  if (!Array.isArray(candidate.satisfied)) return false;
  if (!candidate.satisfied.every((item) => isSatisfiedInput(item))) return false;
  if (!Array.isArray(candidate.requests)) return false;
  if (!candidate.requests.every((item) => isInformationRequest(item))) return false;
  if (typeof candidate.safetyCritical !== "boolean") return false;
  const bounds = candidate.appliedBounds as Record<string, unknown> | undefined;
  if (!bounds || typeof bounds !== "object") return false;
  for (const key of [
    "allowedOutputKinds",
    "forbidOutputKinds",
    "explicitUnknowns",
    "requiredAssumptionTags",
  ]) {
    if (!Array.isArray(bounds[key])) return false;
    if (!(bounds[key] as unknown[]).every((item) => typeof item === "string" && item.length > 0)) {
      return false;
    }
  }
  return true;
}
