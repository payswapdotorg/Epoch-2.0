/**
 * epoch-persistence SurfaceIdentityRegistry：surface/session 连续性注册表。
 *
 * 伴随 W003 Solution Surface 生命周期（open/activate/close/restore）分配并
 * 稳定重推导 SessionSurfaceIdentity，全部经 WorldStore 端口持久化。
 *
 * 权威边界（ARCHITECTURE-LOCK #14「一个职责一个权威」）：
 * - W003 SolutionSurfaceController 仍是生命周期权威（引擎解析/会话挂载）；
 * - 本注册表是**身份持久化**权威：稳定 id 的分配/重推导 + 恢复锚点维护；
 * - 恢复定律：restore 关闭的 surface 按 digest 重新挂接到同一持久化修订世系
 *   ——绝不按可变指针（锚点是内容寻址摘要，跨进程可重推导）。
 *
 * 幂等语义与 W003 冻结语义对齐：
 * - open：同一身份已打开 → 复用既有身份（created=false）；已持久化（曾关闭）
 *   → 重推导同一身份（created=false）；全新 → 确定性派生 id（created=true）。
 * - activate：已激活 no-op；未知 tabId 抛错。
 * - close：已关闭/未知 tabId no-op 成功（幂等释放）；持久化记录保留——
 *   关闭不销毁 durable record（连续性定律）。
 * - restore：对已打开 surface 原样返回（幂等）；从未持久化 → typed error。
 *
 * id 派生确定性：surfaceId/sessionId/tabId 全部由解身份键派生（无随机、
 * 无时间），同一身份跨进程/跨注册表实例得到同一 id——稳定重推导的根基。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import type {
  EngineProvenance,
  PersistedRevision,
  PersistedSolution,
  RevisionLineageEntry,
  SessionSurfaceIdentity,
  SolutionIdentity,
  SurfaceRestoreAnchor,
  WorldStore,
} from "./contract.ts";
import { PERSISTENCE_FORMAT_VERSION } from "./contract.ts";
import { solutionIdentityKey } from "./identity.ts";

/** 注册表 DI 运行时（依赖注入——W003 模式）。 */
export interface SurfaceIdentityRegistryRuntime {
  /** 持久化端口（唯一持久记录——文件/内存/外部 DB 适配器均可注入）。 */
  readonly store: WorldStore;
  /** 可选的 surfaceId 工厂；缺省确定性派生（见 defaultSurfaceId）。 */
  readonly createSurfaceId?: (identity: SolutionIdentity) => string;
  /** 可选的 sessionId 工厂；缺省确定性派生（见 defaultSessionId）。 */
  readonly createSessionId?: (identity: SolutionIdentity) => string;
  /** 可选的 tabId 工厂；缺省确定性派生（与 W003 tab 前缀对齐）。 */
  readonly createTabId?: (identity: SolutionIdentity) => string;
}

/** open/attach 请求公共形态：解身份 + 权威修订 + 引擎溯源。 */
export interface SurfaceRevisionRequest {
  readonly identity: SolutionIdentity;
  readonly revision: WorldRevision;
  readonly engine: EngineProvenance;
}

/** open 结果：稳定身份 + 锚定修订（从 store 按摘要载入）+ 世系 + 幂等标记。 */
export interface SurfaceIdentityAssignment {
  readonly identity: SessionSurfaceIdentity;
  readonly revision: PersistedRevision;
  readonly solution: PersistedSolution;
  readonly created: boolean;
}

/** restore 结果：稳定身份 + 按 digest 重新挂接的修订 + 世系。 */
export interface SurfaceRestoreResult {
  readonly identity: SessionSurfaceIdentity;
  readonly revision: PersistedRevision;
  readonly solution: PersistedSolution;
}

/** list 结果：live surface 快照（按 tabId 稳定排序——无时间戳可用）。 */
export interface SurfaceIdentityState {
  readonly surfaces: readonly SessionSurfaceIdentity[];
  readonly activeTabId: string | null;
}

/** 缺省 surfaceId 派生：epoch-surface:<身份键>。 */
export function defaultSurfaceId(identity: SolutionIdentity): string {
  return `epoch-surface:${solutionIdentityKey(identity)}`;
}

/** 缺省 sessionId 派生：epoch-session:<身份键>。 */
export function defaultSessionId(identity: SolutionIdentity): string {
  return `epoch-session:${solutionIdentityKey(identity)}`;
}

/** 缺省 tabId 派生：solution:<身份键>（与 W003 tab id 前缀对齐）。 */
export function defaultTabId(identity: SolutionIdentity): string {
  return `solution:${solutionIdentityKey(identity)}`;
}

interface LiveEntry {
  readonly identity: SessionSurfaceIdentity;
}

/**
 * Surface Identity 注册表（身份持久化权威；非第二生命周期权威）。
 * 一个实例对应一个进程/工作区的 surface 身份连续性状态。
 */
export class SurfaceIdentityRegistry {
  private readonly runtime: SurfaceIdentityRegistryRuntime;
  private readonly liveByTabId = new Map<string, LiveEntry>();
  private readonly tabIdBySolutionKey = new Map<string, string>();
  private activeTabId: string | null = null;

  constructor(runtime: SurfaceIdentityRegistryRuntime) {
    this.runtime = runtime;
  }

  /**
   * 打开（或重开）一个解 surface 的身份记录。
   * - live → 复用并激活（created=false，幂等）；
   * - 已持久化（曾关闭）→ 重推导同一身份（created=false）并附加请求修订；
   * - 全新 → 派生稳定 id、持久化修订/世系/身份（created=true）。
   */
  async open(request: SurfaceRevisionRequest): Promise<SurfaceIdentityAssignment> {
    const solutionKey = solutionIdentityKey(request.identity);
    const liveTabId = this.tabIdBySolutionKey.get(solutionKey);
    if (liveTabId !== undefined) {
      const entry = this.liveByTabId.get(liveTabId);
      if (entry) {
        this.activeTabId = entry.identity.tabId;
        return this.assignmentFor(entry.identity, false);
      }
    }
    const tabId = this.deriveTabId(request.identity);
    const persisted = await this.tryLoadSurfaceIdentity(tabId);
    let identity: SessionSurfaceIdentity;
    let created: boolean;
    if (persisted === null) {
      identity = await this.assignNewIdentity(request, tabId);
      created = true;
    } else {
      // 曾关闭 → 重推导同一身份，再附加请求修订（同摘要则幂等 no-op）。
      identity = await this.attachRevision(request);
      created = false;
    }
    this.liveByTabId.set(identity.tabId, { identity });
    this.tabIdBySolutionKey.set(solutionKey, identity.tabId);
    this.activeTabId = identity.tabId;
    return this.assignmentFor(identity, created);
  }

  /** 激活一个 live surface；已激活 no-op；未知/未打开 tabId 抛错（W003 语义）。 */
  activate(tabId: string): SessionSurfaceIdentity {
    const entry = this.liveByTabId.get(tabId);
    if (!entry) {
      throw new Error(`solution surface tab not live: ${tabId}`);
    }
    this.activeTabId = entry.identity.tabId;
    return entry.identity;
  }

  /**
   * 关闭一个 surface：幂等释放 live 状态；持久化身份记录**保留**
   * （restore 依赖它——durable record 不随关闭销毁）。
   */
  close(tabId: string): void {
    const entry = this.liveByTabId.get(tabId);
    if (!entry) return; // 幂等：已关闭/未知 tabId no-op 成功。
    this.liveByTabId.delete(tabId);
    this.tabIdBySolutionKey.delete(solutionIdentityKey(entry.identity.anchor.identity));
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  /**
   * 恢复一个已关闭的 surface：从 store 重推导身份，按锚点 digest 重新挂接
   * 到持久化修订世系（绝不按可变指针）。对 live surface 原样返回（幂等）。
   */
  async restore(tabId: string): Promise<SurfaceRestoreResult> {
    const live = this.liveByTabId.get(tabId);
    if (live) {
      this.activeTabId = live.identity.tabId;
      return this.restoreResultFor(live.identity);
    }
    const identity = await this.runtime.store.loadSurfaceIdentity(tabId);
    const solution = await this.runtime.store.loadSolution(identity.anchor.identity);
    // 严格按摘要重新挂接：锚点修订必须存在于 store，缺失即 typed error。
    const revision = await this.runtime.store.loadRevision(identity.anchor.digest);
    this.liveByTabId.set(tabId, { identity });
    this.tabIdBySolutionKey.set(solutionIdentityKey(identity.anchor.identity), tabId);
    this.activeTabId = tabId;
    return { identity, revision, solution };
  }

  /**
   * 附加一个新权威修订：保存修订、按去重定律推进世系、锚点前移到该摘要。
   * surface 必须已通过 open 建立（live 或已持久化），否则 typed error。
   */
  async attachRevision(request: SurfaceRevisionRequest): Promise<SessionSurfaceIdentity> {
    const solutionKey = solutionIdentityKey(request.identity);
    const liveTabId = this.tabIdBySolutionKey.get(solutionKey);
    const tabId = liveTabId ?? this.deriveTabId(request.identity);
    const identity = await this.runtime.store.loadSurfaceIdentity(tabId);
    await this.saveRevisionRecord(request);
    const solution = await this.runtime.store.loadSolution(request.identity);
    const lineage = appendLineageEntry(solution.lineage, request.revision);
    await this.runtime.store.saveSolution({ identity: request.identity, lineage });
    const updated: SessionSurfaceIdentity = {
      ...identity,
      anchor: anchorFor(request),
    };
    await this.runtime.store.saveSurfaceIdentity(updated);
    if (liveTabId !== undefined) {
      this.liveByTabId.set(liveTabId, { identity: updated });
    }
    return updated;
  }

  /** live surface 快照（按 tabId 升序——确定性排序）。 */
  list(): SurfaceIdentityState {
    const surfaces = [...this.liveByTabId.values()]
      .map((entry) => entry.identity)
      .sort((left, right) => compareStrings(left.tabId, right.tabId));
    return { surfaces, activeTabId: this.activeTabId };
  }

  private async assignNewIdentity(
    request: SurfaceRevisionRequest,
    tabId: string,
  ): Promise<SessionSurfaceIdentity> {
    await this.saveRevisionRecord(request);
    const identity: SessionSurfaceIdentity = {
      surfaceId: this.deriveSurfaceId(request.identity),
      sessionId: this.deriveSessionId(request.identity),
      tabId,
      anchor: anchorFor(request),
    };
    await this.runtime.store.saveSurfaceIdentity(identity);
    await this.runtime.store.saveSolution({
      identity: request.identity,
      lineage: [lineageEntryFor(request.revision)],
    });
    return identity;
  }

  private async saveRevisionRecord(request: SurfaceRevisionRequest): Promise<void> {
    await this.runtime.store.saveRevision({
      revision: request.revision,
      digest: request.revision.digest,
      engine: request.engine,
      persistence: {
        formatVersion: PERSISTENCE_FORMAT_VERSION,
        storeKind: this.runtime.store.storeKind,
      },
    });
  }

  private async assignmentFor(
    identity: SessionSurfaceIdentity,
    created: boolean,
  ): Promise<SurfaceIdentityAssignment> {
    const revision = await this.runtime.store.loadRevision(identity.anchor.digest);
    const solution = await this.runtime.store.loadSolution(identity.anchor.identity);
    return { identity, revision, solution, created };
  }

  private async restoreResultFor(identity: SessionSurfaceIdentity): Promise<SurfaceRestoreResult> {
    const revision = await this.runtime.store.loadRevision(identity.anchor.digest);
    const solution = await this.runtime.store.loadSolution(identity.anchor.identity);
    return { identity, revision, solution };
  }

  private async tryLoadSurfaceIdentity(tabId: string): Promise<SessionSurfaceIdentity | null> {
    try {
      return await this.runtime.store.loadSurfaceIdentity(tabId);
    } catch (error) {
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }

  private deriveTabId(identity: SolutionIdentity): string {
    return this.runtime.createTabId?.(identity) ?? defaultTabId(identity);
  }

  private deriveSurfaceId(identity: SolutionIdentity): string {
    return this.runtime.createSurfaceId?.(identity) ?? defaultSurfaceId(identity);
  }

  private deriveSessionId(identity: SolutionIdentity): string {
    return this.runtime.createSessionId?.(identity) ?? defaultSessionId(identity);
  }
}

/** 锚点派生：identity + 修订身份 + digest（内容寻址，绝不指针）。 */
function anchorFor(request: SurfaceRevisionRequest): SurfaceRestoreAnchor {
  return {
    identity: request.identity,
    revisionId: request.revision.revisionId,
    digest: request.revision.digest,
  };
}

/** 世系条目：修订身份 + digest。 */
function lineageEntryFor(revision: WorldRevision): RevisionLineageEntry {
  return { revisionId: revision.revisionId, digest: revision.digest };
}

/**
 * 世系推进定律：digest 未见于世系 → 追加；已存在 → 世系不变（无重复摘要）。
 * 锚点（在身份记录上）独立前移——回到旧修订 = 锚点回移、世系保持完整历史。
 */
function appendLineageEntry(
  lineage: readonly RevisionLineageEntry[],
  revision: WorldRevision,
): readonly RevisionLineageEntry[] {
  if (lineage.some((entry) => entry.digest === revision.digest)) {
    return lineage;
  }
  return [...lineage, lineageEntryFor(revision)];
}

/** provider-neutral 的 not-found 判别（按 code 语义，不绑定具体错误类）。 */
function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "record-not-found"
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
