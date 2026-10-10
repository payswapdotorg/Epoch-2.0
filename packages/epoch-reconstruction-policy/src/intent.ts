/**
 * epoch-reconstruction-policy 重建意图（任务侧输入）。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md「Intent
 * and profile」：声明任务/工种、目标范围、请求保真度、决策与后果、可接受
 * 不确定度、已知证据与用户覆盖（如「探索性、容忍 ±20%」）。不声明如何重建——
 * 那是 profile 与 resolver 的职责。
 */
import type { FidelityLevel } from "./fidelity.ts";
import { isFidelityLevel } from "./fidelity.ts";
import type { EvidenceDescriptor, WorkTypeId } from "./evidence.ts";
import { isEvidenceDescriptor } from "./evidence.ts";

export interface ReconstructionIntent {
  /** 任务稳定标识（用于跨步骤 sufficiency 重算）。 */
  readonly taskId: string;
  /** 项目稳定标识（同一 canonical 世界）。 */
  readonly projectId: string;
  /** 工种（feasibility/boq/clash/structural/site-verification/...）。 */
  readonly workType: WorkTypeId;
  /** 目标范围：关注的实体/系统/楼层/区域标识（开放字符串域）。 */
  readonly targetScope: readonly string[];
  /** 请求保真度等级（驱动 profile 强制门）。 */
  readonly requestedFidelity: FidelityLevel;
  /** 该任务支持的决策（如 "concept-selection" / "boq-class-3" / "clash-mep-vs-structure"）。 */
  readonly decisions: readonly string[];
  /** 后果等级（低/中/高；驱动「不可降级的安全/合规要求」）。 */
  readonly consequenceOfError: "low" | "medium" | "high";
  /** 可接受不确定度（如 {dimension: 0.1, load: 0.05}；开放语义，profile 可读）。 */
  readonly acceptableUncertainty?: Readonly<Record<string, number>>;
  /** 已知证据描述符（来自先前采集/上传）。 */
  readonly evidence: readonly EvidenceDescriptor[];
  /** 用户覆盖（如「探索性、显式放弃结构验证」；profile 必须显式承接为约束）。 */
  readonly userOverrides?: readonly string[];
}

export function isReconstructionIntent(value: unknown): value is ReconstructionIntent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.taskId !== "string" || candidate.taskId.length === 0) return false;
  if (typeof candidate.projectId !== "string" || candidate.projectId.length === 0) return false;
  if (typeof candidate.workType !== "string" || candidate.workType.length === 0) return false;
  if (!Array.isArray(candidate.targetScope)) return false;
  if (!candidate.targetScope.every((item) => typeof item === "string" && item.length > 0)) {
    return false;
  }
  if (!isFidelityLevel(candidate.requestedFidelity)) return false;
  if (!Array.isArray(candidate.decisions)) return false;
  if (!candidate.decisions.every((item) => typeof item === "string" && item.length > 0)) {
    return false;
  }
  if (
    candidate.consequenceOfError !== "low" &&
    candidate.consequenceOfError !== "medium" &&
    candidate.consequenceOfError !== "high"
  ) {
    return false;
  }
  if (candidate.acceptableUncertainty !== undefined) {
    if (
      typeof candidate.acceptableUncertainty !== "object" ||
      candidate.acceptableUncertainty === null
    ) {
      return false;
    }
    for (const v of Object.values(candidate.acceptableUncertainty)) {
      if (typeof v !== "number" || !Number.isFinite(v)) return false;
    }
  }
  if (!Array.isArray(candidate.evidence)) return false;
  if (!candidate.evidence.every((item) => isEvidenceDescriptor(item))) return false;
  if (candidate.userOverrides !== undefined) {
    if (!Array.isArray(candidate.userOverrides)) return false;
    if (!candidate.userOverrides.every((item) => typeof item === "string" && item.length > 0)) {
      return false;
    }
  }
  return true;
}
