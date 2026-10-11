/**
 * epoch-persistence 结构守卫。
 *
 * 只做结构校验（类型/形状/格式），不做语义派生：守卫通过的记录与守卫
 * 拒绝的记录都以调用方给出的形态为准——store 不修改任何内容。
 * 摘要格式校验复用冻结的 epoch-world-model `isWorldDigest`。
 */
import { isWorldDigest, isWorldRevision } from "@zcode/epoch-world-model";
import type {
  EngineProvenance,
  PersistedRevision,
  PersistedSolution,
  PersistenceMetadata,
  RevisionLineageEntry,
  SessionSurfaceIdentity,
  SolutionIdentity,
  SurfaceRestoreAnchor,
} from "./contract.ts";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** 引擎溯源守卫：四个身份字段非空字符串（runtime 为开放字符串域）。 */
export function isEngineProvenance(value: unknown): value is EngineProvenance {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.engineId) &&
    isNonEmptyString(candidate.engineName) &&
    isNonEmptyString(candidate.engineVersion) &&
    isNonEmptyString(candidate.runtime)
  );
}

/** 持久化元数据守卫：formatVersion 为正整数，storeKind 非空。 */
export function isPersistenceMetadata(value: unknown): value is PersistenceMetadata {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.formatVersion !== "number" ||
    !Number.isInteger(candidate.formatVersion) ||
    candidate.formatVersion <= 0
  ) {
    return false;
  }
  return isNonEmptyString(candidate.storeKind);
}

/**
 * PersistedRevision 守卫：修订通过冻结守卫、digest 为 64 位小写 hex 且
 * 与 revision.digest 一致（镜像校验；内容摘要校验在 validation.ts）。
 */
export function isPersistedRevision(value: unknown): value is PersistedRevision {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isWorldRevision(candidate.revision)) return false;
  if (!isWorldDigest(candidate.digest)) return false;
  if (candidate.digest !== candidate.revision.digest) return false;
  if (!isEngineProvenance(candidate.engine)) return false;
  return isPersistenceMetadata(candidate.persistence);
}

/** 世系条目守卫。 */
export function isRevisionLineageEntry(value: unknown): value is RevisionLineageEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isNonEmptyString(candidate.revisionId) && isWorldDigest(candidate.digest);
}

/** 解身份三元组守卫。 */
export function isSolutionIdentity(value: unknown): value is SolutionIdentity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.workspaceKey) &&
    isNonEmptyString(candidate.engineId) &&
    isNonEmptyString(candidate.solutionId)
  );
}

/**
 * PersistedSolution 守卫：身份合法、世系非空（解必须指向至少一个修订）、
 * 条目合法且 digest 去重（世系是无重复摘要的历史集合）。
 */
export function isPersistedSolution(value: unknown): value is PersistedSolution {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isSolutionIdentity(candidate.identity)) return false;
  if (!Array.isArray(candidate.lineage) || candidate.lineage.length === 0) return false;
  if (!candidate.lineage.every((entry) => isRevisionLineageEntry(entry))) return false;
  const digests = new Set(
    (candidate.lineage as RevisionLineageEntry[]).map((entry) => entry.digest),
  );
  return digests.size === candidate.lineage.length;
}

/** 恢复锚点守卫：身份三元组 + 修订身份 + 64 位 hex 摘要。 */
export function isSurfaceRestoreAnchor(value: unknown): value is SurfaceRestoreAnchor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isSolutionIdentity(candidate.identity)) return false;
  if (!isNonEmptyString(candidate.revisionId)) return false;
  return isWorldDigest(candidate.digest);
}

/** SessionSurfaceIdentity 守卫：三个稳定 id + 合法锚点。 */
export function isSessionSurfaceIdentity(value: unknown): value is SessionSurfaceIdentity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.surfaceId)) return false;
  if (!isNonEmptyString(candidate.sessionId)) return false;
  if (!isNonEmptyString(candidate.tabId)) return false;
  return isSurfaceRestoreAnchor(candidate.anchor);
}
