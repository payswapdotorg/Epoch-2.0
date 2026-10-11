/**
 * epoch-persistence 内存适配器：测试/运行时默认 WorldStore。
 *
 * 与文件适配器共享同一校验路径（validation.ts）——provider-neutral 定律对
 * 两个适配器完全一致：同一定律、同一 typed error 分类。内存中不存在外部
 * 篡改面，故损坏类错误（record-corrupt）在本适配器上按构造不可触发——
 * 这是两个提供者之间诚实的能力差异（文件适配器的篡改面是磁盘）。
 *
 * 字节稳定性：save 的「已存在即比较」用 canonicalJsonStringify 比对——
 * 与文件适配器的字节比较同构（内存无文件字节，规范字节是等价比较面）。
 */
import type {
  PersistedRevision,
  PersistedSolution,
  SessionSurfaceIdentity,
  SolutionIdentity,
  WorldStore,
} from "./contract.ts";
import { canonicalJsonStringify } from "./canonical.ts";
import { PersistenceError } from "./errors.ts";
import { solutionIdentityKey } from "./identity.ts";
import {
  assertDigestKey,
  assertIdentityKey,
  assertPersistableRevision,
  assertPersistableSolution,
  assertPersistableSurfaceIdentity,
} from "./validation.ts";

/** 内存适配器默认 storeKind。 */
export const MEMORY_STORE_KIND = "memory" as const;

/** 内存适配器选项。 */
export interface InMemoryWorldStoreOptions {
  readonly storeKind?: string;
}

/**
 * 纯内存 WorldStore：测试与受限运行时（无文件系统环境）的默认实现。
 * 一个实例即一个隔离存储；快照只读返回（外部不可经返回值篡改内部状态）。
 */
export class InMemoryWorldStore implements WorldStore {
  readonly storeKind: string;
  private readonly revisionsByDigest = new Map<string, PersistedRevision>();
  private readonly solutionsByIdentityKey = new Map<string, PersistedSolution>();
  private readonly surfacesByTabId = new Map<string, SessionSurfaceIdentity>();

  constructor(options: InMemoryWorldStoreOptions = {}) {
    this.storeKind = options.storeKind ?? MEMORY_STORE_KIND;
  }

  async saveRevision(record: PersistedRevision): Promise<void> {
    assertPersistableRevision(record, this.storeKind);
    const existing = this.revisionsByDigest.get(record.digest);
    if (existing === undefined) {
      this.revisionsByDigest.set(record.digest, record);
      return;
    }
    if (canonicalJsonStringify(existing) !== canonicalJsonStringify(record)) {
      throw new PersistenceError({
        code: "record-conflict",
        storeKind: this.storeKind,
        key: record.digest,
        message: `content-addressed record ${record.digest} already exists with different content`,
      });
    }
    // 同 digest 同内容：幂等 no-op（保持首次写入的实例——store 返回它存下的）。
  }

  async loadRevision(digest: string): Promise<PersistedRevision> {
    assertDigestKey(digest, this.storeKind);
    const record = this.revisionsByDigest.get(digest);
    if (record === undefined) {
      throw new PersistenceError({
        code: "record-not-found",
        storeKind: this.storeKind,
        key: digest,
        message: `no persisted record for key ${digest}`,
      });
    }
    return record;
  }

  async listRevisions(): Promise<readonly PersistedRevision[]> {
    return [...this.revisionsByDigest.values()].sort((left, right) =>
      compareBy(left, right, (record) => record.digest),
    );
  }

  async saveSolution(solution: PersistedSolution): Promise<void> {
    assertPersistableSolution(solution, this.storeKind);
    this.solutionsByIdentityKey.set(solutionIdentityKey(solution.identity), solution);
  }

  async loadSolution(identity: SolutionIdentity): Promise<PersistedSolution> {
    assertIdentityKey(identity, this.storeKind);
    const key = solutionIdentityKey(identity);
    const solution = this.solutionsByIdentityKey.get(key);
    if (solution === undefined) {
      throw new PersistenceError({
        code: "record-not-found",
        storeKind: this.storeKind,
        key,
        message: `no persisted record for key ${key}`,
      });
    }
    return solution;
  }

  async listSolutions(): Promise<readonly PersistedSolution[]> {
    return [...this.solutionsByIdentityKey.values()].sort((left, right) =>
      compareBy(left, right, (solution) => solutionIdentityKey(solution.identity)),
    );
  }

  async saveSurfaceIdentity(identity: SessionSurfaceIdentity): Promise<void> {
    assertPersistableSurfaceIdentity(identity, this.storeKind);
    this.surfacesByTabId.set(identity.tabId, identity);
  }

  async loadSurfaceIdentity(tabId: string): Promise<SessionSurfaceIdentity> {
    const identity = this.surfacesByTabId.get(tabId);
    if (identity === undefined) {
      throw new PersistenceError({
        code: "record-not-found",
        storeKind: this.storeKind,
        key: tabId,
        message: `no persisted record for key ${tabId}`,
      });
    }
    return identity;
  }

  async listSurfaceIdentities(): Promise<readonly SessionSurfaceIdentity[]> {
    return [...this.surfacesByTabId.values()].sort((left, right) =>
      compareBy(left, right, (identity) => identity.tabId),
    );
  }
}

function compareBy<T>(left: T, right: T, key: (value: T) => string): number {
  if (key(left) < key(right)) return -1;
  if (key(left) > key(right)) return 1;
  return 0;
}
