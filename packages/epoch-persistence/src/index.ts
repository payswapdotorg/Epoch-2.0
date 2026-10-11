/**
 * @zcode/epoch-persistence 公共入口。
 *
 * W021 — Durable Persistence：权威世界/解修订与稳定 surface/session 身份的
 * 持久化。Typed core（PersistedRevision/PersistedSolution/
 * SessionSurfaceIdentity）+ provider-neutral WorldStore 端口（文件/内存双
 * 适配器）+ SurfaceIdentityRegistry（W003 生命周期伴随的身份连续性）+
 * 非权威缓存定律（invalidateCacheFor）。
 *
 * 不引入第二语义权威（ARCHITECTURE-LOCK #4/#14）：store 原样存取权威
 * WorldRevision，损坏/未知记录以 PersistenceError 浮出，绝不静默修复；
 * 摘要校验委托冻结的 epoch-world-model（唯一摘要权威）。零引擎/渲染器
 * 依赖；外部 DB 适配器未来直接实现 WorldStore 端口即可接入。
 */
export type {
  EngineProvenance,
  PersistenceMetadata,
  PersistedRevision,
  PersistedSolution,
  RevisionLineageEntry,
  SessionSurfaceIdentity,
  SolutionIdentity,
  SurfaceRestoreAnchor,
  WorldStore,
} from "./contract.ts";
export { PERSISTENCE_FORMAT_VERSION } from "./contract.ts";
export type { PersistenceErrorCode, PersistenceErrorInit } from "./errors.ts";
export {
  PERSISTENCE_ERROR_CODES,
  PERSISTENCE_ERROR_CODE_SET,
  PersistenceError,
  isPersistenceError,
  isPersistenceErrorCode,
} from "./errors.ts";
export {
  isEngineProvenance,
  isPersistedRevision,
  isPersistedSolution,
  isPersistenceMetadata,
  isRevisionLineageEntry,
  isSessionSurfaceIdentity,
  isSolutionIdentity,
  isSurfaceRestoreAnchor,
} from "./guards.ts";
export { canonicalJsonStringify } from "./canonical.ts";
export { solutionIdentityKey, solutionIdentityFromTab } from "./identity.ts";
export type { FileSystemWorldStoreOptions } from "./file-store.ts";
export { FILE_STORE_KIND, FileSystemWorldStore } from "./file-store.ts";
export type { InMemoryWorldStoreOptions } from "./memory-store.ts";
export { MEMORY_STORE_KIND, InMemoryWorldStore } from "./memory-store.ts";
export type {
  SurfaceIdentityAssignment,
  SurfaceIdentityRegistryRuntime,
  SurfaceIdentityState,
  SurfaceRestoreResult,
  SurfaceRevisionRequest,
} from "./registry.ts";
export {
  SurfaceIdentityRegistry,
  defaultSessionId,
  defaultSurfaceId,
  defaultTabId,
} from "./registry.ts";
export type { CacheInvalidationHook, WorldRevisionCacheStats } from "./cache.ts";
export { CachedWorldStore, WorldRevisionCache } from "./cache.ts";
export { epochPersistenceModule } from "./module.ts";
// 冻结契约再导出（让宿主单入口消费——epoch-solution-runtime 先例）。
export type { WorldRevision } from "@zcode/epoch-world-model";
export type { SolutionSurfaceTab } from "@zcode/epoch-solution-contract";
