/**
 * epoch-world-model 世界修订。
 *
 * 依据 spec/architecture/contracts/world-model.md「World revision」：
 * digest 对同一规范语义输入是确定性的（算法定义见 digest.ts）。
 * presentationSeed 是投影种子（非语义内容，不参与摘要）。
 * 变体（variant）是修订/增量关系；时间线标记引用语义修订/操作——
 * 这些后续工单实现，W001 只冻结承载类型。
 */
import type { WorldEntity } from "./entity.ts";
import { isWorldEntity } from "./entity.ts";
import type { WorldRelationship } from "./relationship.ts";
import { isWorldRelationship } from "./relationship.ts";
import type { ProvenanceRef } from "./provenance.ts";
import { isProvenanceRef } from "./provenance.ts";

/**
 * 投影种子：供 presentation 编译做确定性决策的不透明材料。
 * 保持为可演化的对象（未来可加调色/相机默认值），W001 只要求 seed 字符串。
 */
export interface WorldPresentationSeed {
  readonly seed: string;
}

/** 投影种子守卫。 */
export function isWorldPresentationSeed(value: unknown): value is WorldPresentationSeed {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.seed === "string" && candidate.seed.length > 0;
}

/**
 * 世界修订：一次语义世界状态的不可变快照。
 *
 * - worldId：世界身份（跨修订稳定）。
 * - revisionId：修订身份（每次修订唯一；不参与摘要内容）。
 * - digest：canonicalizeWorld + sha256 的确定性摘要（64 位小写 hex）。
 * - provenance：修订级溯源（必填，可为空数组——空数组与缺失语义不同，
 *   守卫要求字段存在；空数组表示「确认无来源」）。
 */
export interface WorldRevision {
  readonly worldId: string;
  readonly revisionId: string;
  readonly digest: string;
  readonly entities: readonly WorldEntity[];
  readonly relationships: readonly WorldRelationship[];
  readonly presentationSeed: WorldPresentationSeed;
  readonly provenance: readonly ProvenanceRef[];
}

/** 世界修订守卫：含摘要格式（64 位小写 hex）校验。 */
export function isWorldRevision(value: unknown): value is WorldRevision {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.worldId !== "string" || candidate.worldId.length === 0) return false;
  if (typeof candidate.revisionId !== "string" || candidate.revisionId.length === 0) return false;
  if (typeof candidate.digest !== "string" || !/^[0-9a-f]{64}$/.test(candidate.digest)) {
    return false;
  }
  if (!Array.isArray(candidate.entities) || !candidate.entities.every(isWorldEntity)) {
    return false;
  }
  if (!Array.isArray(candidate.relationships)) return false;
  if (!candidate.relationships.every(isWorldRelationship)) return false;
  if (!isWorldPresentationSeed(candidate.presentationSeed)) return false;
  if (!Array.isArray(candidate.provenance)) return false;
  if (!candidate.provenance.every((item) => isProvenanceRef(item))) return false;
  return true;
}
