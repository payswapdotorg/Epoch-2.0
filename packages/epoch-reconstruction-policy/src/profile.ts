/**
 * epoch-reconstruction-policy 重建 profile（能力侧配置）。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md「Intent
 * and profile」：profile 定义该工种所需输入、可选输入、不确定性策略、输出
 * 边界与强制阻塞门。不是第二个世界，不是渲染器特定配置（不变量 14）。注册为
 * capability，可组合、可独立演进（验收点 6）。
 */
import type { FidelityLevel } from "./fidelity.ts";
import { isFidelityLevel } from "./fidelity.ts";
import type { WorkTypeId } from "./evidence.ts";
import type { InferenceProvenanceTag } from "./evidence.ts";
import { isInferenceProvenanceTag } from "./evidence.ts";

/**
 * 输入要求：profile 声明其需要/可选的证据类别与判定。
 *
 * - kind：证据语义类别（与 EvidenceDescriptor.kind 匹配）。
 * - required：true 为强制门（缺失→BLOCKED 或 INFORMATION_REQUESTED）；
 *   false 为可选门（缺失→记录缺口，状态保持 READY/CONDITIONALLY_READY）。
 * - acceptTags：可接受的推断标签集合。若证据存在但其 inferenceTag 不在
 *   acceptTags 内，视为「类别满足但质量不满足」（验收点 8 强制门）。
 *   例如 structural profile 对 "load.dead" 的 acceptTags 必须排除
 *   inferred/defaulted/unknown（验收点 4）。
 * - blockOnConflict：若该类别存在 disputed/冲突证据，是否直接阻塞
 *   （而非仅触发 reconciliation 请求）。
 * - coverageRequired：是否要求证据显式声明覆盖范围（用于 clash 的 systems 覆盖）。
 */
export interface ProfileInputRequirement {
  readonly kind: string;
  readonly required: boolean;
  readonly acceptTags: readonly InferenceProvenanceTag[];
  readonly blockOnConflict?: boolean;
  readonly coverageRequired?: boolean;
}

export function isProfileInputRequirement(value: unknown): value is ProfileInputRequirement {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.kind !== "string" || candidate.kind.length === 0) return false;
  if (typeof candidate.required !== "boolean") return false;
  if (!Array.isArray(candidate.acceptTags)) return false;
  if (!candidate.acceptTags.every((item) => isInferenceProvenanceTag(item))) return false;
  if (candidate.blockOnConflict !== undefined && typeof candidate.blockOnConflict !== "boolean") {
    return false;
  }
  if (candidate.coverageRequired !== undefined && typeof candidate.coverageRequired !== "boolean") {
    return false;
  }
  return true;
}

/**
 * 不确定性策略：profile 如何对待推断/默认/冲突/未知。
 *
 * - allowInferredGeometry：是否允许推断几何进入结果（feasibility=true，
 *   structural=false 除非显式 exploratory）。
 * - allowDefaultedProperties：是否允许默认材料属性（feasibility/BOQ 允许带标注；
 *   structural 不允许除非 exploratory）。
 * - requireConflictReconciliation：冲突证据是否必须先调和（clash/structural=true）。
 * - exploratoryBoundedOnly：是否仅在显式 exploratory 边界内允许推断
 *   （structural 分析的「除非显式标注 exploratory 且有界」语义）。
 */
export interface UncertaintyPolicy {
  readonly allowInferredGeometry: boolean;
  readonly allowDefaultedProperties: boolean;
  readonly requireConflictReconciliation: boolean;
  readonly exploratoryBoundedOnly: boolean;
}

export function isUncertaintyPolicy(value: unknown): value is UncertaintyPolicy {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.allowInferredGeometry === "boolean" &&
    typeof candidate.allowDefaultedProperties === "boolean" &&
    typeof candidate.requireConflictReconciliation === "boolean" &&
    typeof candidate.exploratoryBoundedOnly === "boolean"
  );
}

/**
 * 输出边界：profile 允许产出什么、明确禁止产出什么。
 *
 * 验收点 1 的核心机制：feasibility profile 的 outputBounds.explicitUnknowns
 * 标注其结果必须保留的「显式未知」；forbidDetailKinds 标注其结果不得
 * 包含的「结构级细节类别」（如 structural-member-connection-force）。
 */
export interface ProfileOutputBounds {
  /** 允许的输出类别（geometry/quantity/clash-report/analysis/...）。 */
  readonly allowedOutputKinds: readonly string[];
  /** 明确禁止的输出类别（防止低保真任务越权产出高保真结论）。 */
  readonly forbidOutputKinds: readonly string[];
  /** 结果必须显式保留的未知类别（feasibility 的核心：unknowns 必须可见）。 */
  readonly explicitUnknowns: readonly string[];
  /** 结果必须附带的假设/限制标注（如 "broad range ±30%" / "rate as of 2024-06"）。 */
  readonly requiredAssumptionTags: readonly string[];
}

export function isProfileOutputBounds(value: unknown): value is ProfileOutputBounds {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  for (const key of [
    "allowedOutputKinds",
    "forbidOutputKinds",
    "explicitUnknowns",
    "requiredAssumptionTags",
  ]) {
    if (!Array.isArray(candidate[key])) return false;
    if (
      !(candidate[key] as unknown[]).every((item) => typeof item === "string" && item.length > 0)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * 重建 profile：一个工种的「输入要求 + 不确定性策略 + 输出边界」配置。
 *
 * 不是第二个世界，不是渲染器特定配置（不变量 14）。注册为 capability，
 * 可组合、可独立演进（验收点 6）。
 */
export interface ReconstructionProfile {
  /** profile 稳定标识（如 "feasibility" / "boq" / "clash" / "structural" / "site-verification"）。 */
  readonly id: string;
  /** 适配的工种（与 ReconstructionIntent.workType 精确匹配；用于 fallback 时按 purpose 匹配）。 */
  readonly workType: WorkTypeId;
  /** 人类可读用途说明（用于 nearest-purpose fallback 与 UI 展示）。 */
  readonly purpose: string;
  /** 适配的保真度等级（intent.requestedFidelity 必须在此集合内才视为精确匹配）。 */
  readonly supportedFidelities: readonly FidelityLevel[];
  /** 强制 + 可选输入要求（acceptTags 决定证据质量门）。 */
  readonly requiredInputs: readonly ProfileInputRequirement[];
  readonly optionalInputs: readonly ProfileInputRequirement[];
  /** 不确定性策略。 */
  readonly uncertainty: UncertaintyPolicy;
  /** 输出边界（防止越权产出高保真结论）。 */
  readonly outputBounds: ProfileOutputBounds;
  /**
   * 强制阻塞门：当任一 required input 缺失或质量不达标时，是否直接 BLOCKED
   * （consequenceOfError=high 或 fidelity=analytical 时通常 true），
   * 还是允许 INFORMATION_REQUESTED（feasibility/conceptual 通常 false）。
   */
  readonly blockOnMissingMandatory: boolean;
}

export function isReconstructionProfile(value: unknown): value is ReconstructionProfile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.workType !== "string" || candidate.workType.length === 0) return false;
  if (typeof candidate.purpose !== "string" || candidate.purpose.length === 0) return false;
  if (!Array.isArray(candidate.supportedFidelities)) return false;
  if (!candidate.supportedFidelities.every((item) => isFidelityLevel(item))) return false;
  if (!Array.isArray(candidate.requiredInputs)) return false;
  if (!candidate.requiredInputs.every((item) => isProfileInputRequirement(item))) return false;
  if (!Array.isArray(candidate.optionalInputs)) return false;
  if (!candidate.optionalInputs.every((item) => isProfileInputRequirement(item))) return false;
  if (!isUncertaintyPolicy(candidate.uncertainty)) return false;
  if (!isProfileOutputBounds(candidate.outputBounds)) return false;
  if (typeof candidate.blockOnMissingMandatory !== "boolean") return false;
  return true;
}
