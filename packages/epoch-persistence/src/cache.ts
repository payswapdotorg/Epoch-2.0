/**
 * epoch-persistence 缓存定律：客户端/渲染器缓存永远非权威。
 *
 * 依据 W021 任务包第 4 条与 ARCHITECTURE-LOCK #6/#14：
 * - store（WorldStore）是唯一持久记录；缓存只是读侧备忘（memo）；
 * - 显式失效钩子 `invalidateCacheFor(digest)`：失配即弃——缓存未命中必须
 *   仅凭 store 恢复（recoverable from the store alone）；
 * - CachedWorldStore 在**持久写之后主动失效**对应条目（而非刷新）：下一次
 *   读取强制回到 store——缓存永不假设自己知道持久状态，从构造上排除
 *   「缓存成为第二权威」的可能；
 * - 缓存只服务按摘要的修订读取（定律的 digest 粒度）；解/surface 记录与
 *   枚举（list*）一律直通 store——枚举永不经过非权威层。
 */
import type {
  PersistedRevision,
  PersistedSolution,
  SessionSurfaceIdentity,
  SolutionIdentity,
  WorldStore,
} from "./contract.ts";

/** 显式缓存失效钩子（W021 缓存定律的公开面）。 */
export interface CacheInvalidationHook {
  /** 使一个摘要的缓存条目失效（未命中条目为 no-op）。 */
  invalidateCacheFor(digest: string): void;
}

/** 缓存统计（证明非权威性的可观测量）。 */
export interface WorldRevisionCacheStats {
  readonly entries: number;
  readonly hits: number;
  readonly misses: number;
  readonly invalidations: number;
}

/**
 * 修订读缓存：digest → PersistedRevision 的进程内备忘。
 * 无 TTL、无后台刷新、无写路径——它不可能成为权威（丢掉即丢掉，
 * store 始终可完整恢复）。
 */
export class WorldRevisionCache implements CacheInvalidationHook {
  private readonly entries = new Map<string, PersistedRevision>();
  private hits = 0;
  private misses = 0;
  private invalidations = 0;

  /** 读备忘（未命中返回 undefined——调用方必须回源 store）。 */
  get(digest: string): PersistedRevision | undefined {
    const entry = this.entries.get(digest);
    if (entry === undefined) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry;
  }

  /** 写备忘（仅缓存从 store 读到的记录——从不缓存未持久化的内容）。 */
  put(record: PersistedRevision): void {
    this.entries.set(record.digest, record);
  }

  /** 显式失效钩子：按摘要丢弃条目（no-op 安全）。 */
  invalidateCacheFor(digest: string): void {
    if (this.entries.delete(digest)) {
      this.invalidations += 1;
    }
  }

  /** 全量丢弃（模拟缓存崩溃/进程重启——store 不受影响）。 */
  clear(): void {
    this.entries.clear();
  }

  /** 统计快照。 */
  stats(): WorldRevisionCacheStats {
    return {
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      invalidations: this.invalidations,
    };
  }
}

/**
 * 带非权威缓存的 WorldStore 装饰器：
 * - saveRevision → 委托底层 store，成功后**失效**（而非刷新）缓存条目；
 * - loadRevision → 缓存命中即返回；未命中回源 store 并写备忘；
 * - 其余操作（枚举、解、surface 记录）一律直通底层 store。
 */
export class CachedWorldStore implements WorldStore {
  readonly storeKind: string;
  readonly cache: WorldRevisionCache;
  private readonly backing: WorldStore;

  constructor(backing: WorldStore, cache: WorldRevisionCache = new WorldRevisionCache()) {
    this.backing = backing;
    this.cache = cache;
    this.storeKind = backing.storeKind;
  }

  async saveRevision(record: PersistedRevision): Promise<void> {
    await this.backing.saveRevision(record);
    // 持久写后失效：缓存不得假设自己仍代表持久状态（非权威定律的执行点）。
    this.cache.invalidateCacheFor(record.digest);
  }

  async loadRevision(digest: string): Promise<PersistedRevision> {
    const cached = this.cache.get(digest);
    if (cached !== undefined) return cached;
    const record = await this.backing.loadRevision(digest);
    this.cache.put(record);
    return record;
  }

  async listRevisions(): Promise<readonly PersistedRevision[]> {
    return this.backing.listRevisions();
  }

  async saveSolution(solution: PersistedSolution): Promise<void> {
    await this.backing.saveSolution(solution);
  }

  async loadSolution(identity: SolutionIdentity): Promise<PersistedSolution> {
    return this.backing.loadSolution(identity);
  }

  async listSolutions(): Promise<readonly PersistedSolution[]> {
    return this.backing.listSolutions();
  }

  async saveSurfaceIdentity(identity: SessionSurfaceIdentity): Promise<void> {
    await this.backing.saveSurfaceIdentity(identity);
  }

  async loadSurfaceIdentity(tabId: string): Promise<SessionSurfaceIdentity> {
    return this.backing.loadSurfaceIdentity(tabId);
  }

  async listSurfaceIdentities(): Promise<readonly SessionSurfaceIdentity[]> {
    return this.backing.listSurfaceIdentities();
  }
}
