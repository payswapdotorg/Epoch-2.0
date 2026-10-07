/**
 * epoch-world-model 语义关系。
 *
 * 依据 spec/architecture/contracts/world-model.md「Relationships」：关系由
 * World Model 定义（contains/supports/connects/serves/adjacent-to/
 * clashes-with/derived-from/depends-on）；渲染器不得发明关系。
 * 关系种类在此冻结为闭合联合，扩展需走契约变更。
 */
import type { ProvenanceRef } from "./provenance.ts";
import { isProvenanceRef } from "./provenance.ts";

/** spec 冻结的关系种类集合。 */
export const WORLD_RELATIONSHIP_KINDS = [
  "contains",
  "supports",
  "connects",
  "serves",
  "adjacent-to",
  "clashes-with",
  "derived-from",
  "depends-on",
] as const;
export type WorldRelationshipKind = (typeof WORLD_RELATIONSHIP_KINDS)[number];

/** 运行时校验集合。 */
export const WORLD_RELATIONSHIP_KIND_SET: ReadonlySet<string> = new Set<string>(
  WORLD_RELATIONSHIP_KINDS,
);

/** 关系种类守卫。 */
export function isWorldRelationshipKind(value: unknown): value is WorldRelationshipKind {
  return typeof value === "string" && WORLD_RELATIONSHIP_KIND_SET.has(value);
}

/**
 * 语义关系：两个实体之间的有向连接（方向由 from -> to 语义决定，
 * adjacent-to 之类对称关系仍按声明方向记录）。
 *
 * relationshipId 是关系身份；摘要按它排序（次级键见 digest.ts）。
 * from/to 必须引用存在的实体 id（由消费方在装载时做引用完整性校验，
 * 守卫只做结构校验）。
 */
export interface WorldRelationship {
  readonly relationshipId: string;
  readonly kind: WorldRelationshipKind;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly label?: string;
  readonly provenance?: readonly ProvenanceRef[];
}

/** 关系守卫：错误类型、缺失必填、未知种类均拒绝。 */
export function isWorldRelationship(value: unknown): value is WorldRelationship {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.relationshipId !== "string" || candidate.relationshipId.length === 0) {
    return false;
  }
  if (!isWorldRelationshipKind(candidate.kind)) return false;
  if (typeof candidate.fromEntityId !== "string" || candidate.fromEntityId.length === 0) {
    return false;
  }
  if (typeof candidate.toEntityId !== "string" || candidate.toEntityId.length === 0) {
    return false;
  }
  if (candidate.label !== undefined && typeof candidate.label !== "string") return false;
  if (candidate.provenance !== undefined) {
    if (!Array.isArray(candidate.provenance)) return false;
    if (!candidate.provenance.every((item) => isProvenanceRef(item))) return false;
  }
  return true;
}
