/**
 * epoch-reconstruction-policy 证据与推断溯源标签（验收点 5/8 的类型核心）。
 *
 * - InferenceProvenanceTag：闭合枚举，不可由 agent 自创新标签；非 confirmed/
 *   measured 的标签永远不能被静默提升为确认事实（验收点 8）。
 * - EvidenceSourceKind：证据来源类型（与 ReconstructionInput 输入分类语义对齐）。
 * - EvidenceProvenance：携带来源 + 时间戳 +（如适用）世界模型 ProvenanceRef
 *   （验收点 5：缺失/冲突证据保持可见且带溯源）。
 * - EvidenceDescriptor：一条可被 profile 评估的证据，含 id/kind/provenance/
 *   inferenceTag/uncertainty/coverage/conflictsWith。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md「Progressive
 * refinement」与 ARCHITECTURE-LOCK 不变量 4/16（provider-neutral core）。
 */
import type { ProvenanceRef } from "@zcode/epoch-world-model";
import { isProvenanceRef } from "@zcode/epoch-world-model";

/** 工种标识（开放字符串域：feasibility / boq / clash / structural / site-verification / ...）。 */
export type WorkTypeId = string;

/**
 * 推断来源标签（验收点 8 的类型核心）。
 *
 * 一条事实/几何/属性的 provenance 标签若非 confirmed，则永远不能在 resolver/展示
 * 中被静默改写为 confirmed。resolver 与 profile 强制门据此判定是否阻塞。
 *
 * - confirmed：来自冻结 fixture、合规源工件、通过验证的证据；可作为结论依据。
 * - measured：实地/图纸/扫描等测量值；带测量不确定度，可作为分析输入但需标注。
 * - inferred：基于其它证据推断（如按楼层数推算标准层几何）；不得作为确认事实。
 * - defaulted：profile/规则提供的默认值（如按规范取默认容重）；必须显式标注。
 * - disputed：多源证据冲突且未调和；进入条件结果或阻塞，不得静默择一。
 * - unknown：缺值；触发 INFORMATION_REQUESTED 或 BLOCKED。
 */
export const INFERENCE_PROVENANCE_TAGS = [
  "confirmed",
  "measured",
  "inferred",
  "defaulted",
  "disputed",
  "unknown",
] as const;
export type InferenceProvenanceTag = (typeof INFERENCE_PROVENANCE_TAGS)[number];

export const INFERENCE_PROVENANCE_TAG_SET: ReadonlySet<string> = new Set<string>(
  INFERENCE_PROVENANCE_TAGS,
);

export function isInferenceProvenanceTag(value: unknown): value is InferenceProvenanceTag {
  return typeof value === "string" && INFERENCE_PROVENANCE_TAG_SET.has(value);
}

/**
 * 判定一条 provenance 标签是否可被「作为确认事实使用」。
 *
 * confirmed 与 measured 可作为结论依据（measured 需附不确定度，但属「可分析」）；
 * inferred / defaulted / disputed / unknown 永远不可被静默提升为 confirmed。
 */
export function isConfirmableProvenance(tag: InferenceProvenanceTag): boolean {
  return tag === "confirmed" || tag === "measured";
}

/** 证据来源类型（与 ReconstructionInput 的输入分类语义对齐，开放扩展）。 */
export const EVIDENCE_SOURCE_KINDS = [
  "fixture",
  "drawing",
  "photo",
  "video",
  "scan",
  "measurement",
  "document",
  "specification",
  "code",
  "site-observation",
  "author",
  "engine",
  "unknown",
] as const;
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];

export const EVIDENCE_SOURCE_KIND_SET: ReadonlySet<string> = new Set<string>(EVIDENCE_SOURCE_KINDS);

export function isEvidenceSourceKind(value: unknown): value is EvidenceSourceKind {
  return typeof value === "string" && EVIDENCE_SOURCE_KIND_SET.has(value);
}

/**
 * 证据溯源：携带来源 + 时间戳 +（如适用）世界模型 ProvenanceRef。
 *
 * 验收点 5：缺失/冲突证据保持可见且带溯源（source + timestamp）。本对象是
 * 证据条目的最小溯源载体；缺失证据用 InferenceProvenanceTag=unknown 的占位
 * EvidenceDescriptor 表达，仍携带「曾经查看过哪些来源」的溯源。
 */
export interface EvidenceProvenance {
  /** 来源类型（drawing/photo/scan/...）。unknown 表示「来源未知」。 */
  readonly sourceKind: EvidenceSourceKind;
  /** 来源标识（文件路径/工件 id/扫描批次 id/...）。 */
  readonly sourceId: string;
  /** 采集/观测时间戳（ISO 8601，如可用）。 */
  readonly timestamp?: string;
  /** 关联到世界模型的语义溯源引用（如可用）。 */
  readonly worldProvenance?: ProvenanceRef;
}

export function isEvidenceProvenance(value: unknown): value is EvidenceProvenance {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isEvidenceSourceKind(candidate.sourceKind)) return false;
  if (typeof candidate.sourceId !== "string" || candidate.sourceId.length === 0) return false;
  if (candidate.timestamp !== undefined && typeof candidate.timestamp !== "string") return false;
  if (candidate.worldProvenance !== undefined && !isProvenanceRef(candidate.worldProvenance)) {
    return false;
  }
  return true;
}

/**
 * 证据描述符：一条可被 profile 评估的证据。
 *
 * - id：证据稳定标识（用于跨任务复用与请求去重）。
 * - kind：证据覆盖的语义类别（如 "geometry.dimension" / "load.dead" / "material.grade"）。
 *   开放字符串域，由 profile 的 requiredInputs/optionalInputs 引用匹配。
 * - provenance：来源 + 时间戳（验收点 5）。
 * - inferenceTag：该证据条目是否为推断/默认/冲突/未知（验收点 8）。
 * - uncertainty：测量/估计不确定度（如 {value: 0.05, unit: "m"} 或相对 ±%）。
 * - coverage：覆盖范围描述（如 "all columns level 1-3" / "structural only"）。
 * - conflictsWith：与该证据冲突的其它证据 id 列表（用于 disputed 判定）。
 */
export interface EvidenceDescriptor {
  readonly id: string;
  readonly kind: string;
  readonly provenance: EvidenceProvenance;
  readonly inferenceTag: InferenceProvenanceTag;
  readonly uncertainty?: { readonly value: number; readonly unit?: string };
  readonly coverage?: string;
  readonly conflictsWith?: readonly string[];
}

export function isEvidenceDescriptor(value: unknown): value is EvidenceDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.kind !== "string" || candidate.kind.length === 0) return false;
  if (!isEvidenceProvenance(candidate.provenance)) return false;
  if (!isInferenceProvenanceTag(candidate.inferenceTag)) return false;
  if (candidate.uncertainty !== undefined) {
    if (typeof candidate.uncertainty !== "object" || candidate.uncertainty === null) return false;
    const u = candidate.uncertainty as Record<string, unknown>;
    if (typeof u.value !== "number" || !Number.isFinite(u.value)) return false;
    if (u.unit !== undefined && typeof u.unit !== "string") return false;
  }
  if (candidate.coverage !== undefined && typeof candidate.coverage !== "string") return false;
  if (candidate.conflictsWith !== undefined) {
    if (!Array.isArray(candidate.conflictsWith)) return false;
    if (!candidate.conflictsWith.every((item) => typeof item === "string" && item.length > 0)) {
      return false;
    }
  }
  return true;
}
