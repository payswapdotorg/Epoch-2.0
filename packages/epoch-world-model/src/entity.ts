/**
 * epoch-world-model 语义实体。
 *
 * 依据 spec/architecture/contracts/world-model.md「Minimum entities」。
 * 「No mesh semantics」：entityId 是规范语义身份；mesh 名、场景节点路径、
 * Babylon id、Three uuid 都不是实体身份。
 *
 * 与 spec 代码块的差异（有意收紧，依据同文件「Units are explicit. Internal
 * normalization must not silently mix engineering units.」）：dimensions 的值
 * 从 number 收紧为 QuantityValue（显式单位），守卫据此拒绝「bad units」。
 */
import type { QuantityValue } from "./units.ts";
import { isQuantityValue } from "./units.ts";
import type { ProvenanceRef } from "./provenance.ts";
import { isProvenanceRef } from "./provenance.ts";

/** 实体材质（类型 + 可选等级）。 */
export interface WorldEntityMaterial {
  readonly type: string;
  readonly grade?: string;
}

/**
 * 工程语义实体：epoch 世界中的最小语义身份单元。
 * entityType 是开放字符串域（column/beam/wall/slab/...），由领域层扩展。
 */
export interface WorldEntity {
  readonly entityId: string;
  readonly entityType: string;
  readonly label: string;
  readonly material?: WorldEntityMaterial;
  /** 显式单位的尺寸映射（如 { length: {value:4.2, unit:"m"} }）。 */
  readonly dimensions?: Readonly<Record<string, QuantityValue>>;
  /** 显式单位的工程量（如混凝土体积、钢筋质量）。 */
  readonly quantity?: QuantityValue;
  readonly phase?: string;
  readonly status?: string;
  readonly costReference?: string;
  /** 该实体必须满足的约束标识集合（顺序不参与语义，摘要中排序）。 */
  readonly constraints?: readonly string[];
  readonly provenance?: readonly ProvenanceRef[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

/** 材质守卫。 */
export function isWorldEntityMaterial(value: unknown): value is WorldEntityMaterial {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.type)) return false;
  if (!isOptionalNonEmptyString(candidate.grade)) return false;
  return true;
}

function isDimensions(value: unknown): value is Readonly<Record<string, QuantityValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const dimensionValue of Object.values(value)) {
    if (!isQuantityValue(dimensionValue)) return false;
  }
  return true;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
  );
}

/**
 * 实体守卫：外部供给的实体必须通过结构校验（错误类型、缺失必填、
 * 非法单位、null 可选字段均拒绝）。
 */
export function isWorldEntity(value: unknown): value is WorldEntity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.entityId)) return false;
  if (!isNonEmptyString(candidate.entityType)) return false;
  if (!isNonEmptyString(candidate.label)) return false;
  if (candidate.material !== undefined && !isWorldEntityMaterial(candidate.material)) {
    return false;
  }
  if (candidate.dimensions !== undefined && !isDimensions(candidate.dimensions)) return false;
  if (candidate.quantity !== undefined && !isQuantityValue(candidate.quantity)) return false;
  if (!isOptionalNonEmptyString(candidate.phase)) return false;
  if (!isOptionalNonEmptyString(candidate.status)) return false;
  if (!isOptionalNonEmptyString(candidate.costReference)) return false;
  if (candidate.constraints !== undefined && !isStringArray(candidate.constraints)) return false;
  if (candidate.provenance !== undefined) {
    if (!Array.isArray(candidate.provenance)) return false;
    if (!candidate.provenance.every((item) => isProvenanceRef(item))) return false;
  }
  return true;
}
