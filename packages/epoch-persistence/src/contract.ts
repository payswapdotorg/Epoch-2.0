/**
 * epoch-persistence 公开契约：持久化记录类型 + WorldStore 端口。
 *
 * 依据 spec/work-orders/W021-durable-persistence.md 与 ARCHITECTURE-LOCK：
 * - 不变量 4（世界模型是唯一语义权威）：本包持久化并原样返回权威
 *   WorldRevision——不派生、不合并、不「修复」世界内容；摘要校验委托冻结的
 *   epoch-world-model `computeWorldDigest`（同一权威的规范函数），绝不自造
 *   第二套摘要算法。
 * - 不变量 14（一个职责一个权威）：store 是唯一持久记录；客户端/渲染器缓存
 *   永远非权威（见 cache.ts 的失效钩子定律）。
 * - 不变量 17（确定性）：存储载荷无时间戳、无随机——同一修订 → 字节相同的
 *   文件；路径由修订摘要内容寻址派生。
 * - provider-neutral：端口不感知任何数据库/引擎/渲染器；外部 DB 适配器未来
 *   直接实现本端口，无需触碰世界模型或渲染器。
 *
 * 只允许从 index.ts import；跨模块不得深引用内部文件。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";

/**
 * 持久化封套格式版本。载荷结构发生不兼容变更时递增；读取端遇到未知版本
 * 以 typed error（unsupported-format）浮出，绝不静默猜测。
 */
export const PERSISTENCE_FORMAT_VERSION = 1 as const;

/** 持久化记录携带的引擎溯源（冻结描述符身份字段的提供者中立投影）。 */
export interface EngineProvenance {
  readonly engineId: string;
  readonly engineName: string;
  readonly engineVersion: string;
  /**
   * 产生该修订的引擎运行时隔离边界（in-process/worker/process/remote…）。
   * 刻意保持为开放字符串：持久层逐字记录引擎元数据，不解释引擎分类学
   * （不依赖 epoch-reconstruction-contract，store 保持 provider-neutral）。
   */
  readonly runtime: string;
}

/**
 * 持久化元数据——只含确定性字段。禁止时间戳（不变量 17：同一修订 →
 * 字节相同文件）；禁止可变指针（内容按摘要寻址）。
 */
export interface PersistenceMetadata {
  /** 封套格式版本（见 PERSISTENCE_FORMAT_VERSION）。 */
  readonly formatVersion: number;
  /** 存储提供者标识（"file" / "memory" / 外部 DB 的自报 id）。 */
  readonly storeKind: string;
}

/**
 * PersistedRevision：一个权威 WorldRevision + 其稳定摘要 + 引擎溯源 +
 * 持久化元数据。digest 必须等于 revision.digest 且等于
 * computeWorldDigest(revision)（保存/读取两侧均校验，失败浮出 typed error）。
 */
export interface PersistedRevision {
  readonly revision: WorldRevision;
  readonly digest: string;
  readonly engine: EngineProvenance;
  readonly persistence: PersistenceMetadata;
}

/** 修订世系条目：内容寻址（digest）+ 修订身份（revisionId）。 */
export interface RevisionLineageEntry {
  readonly revisionId: string;
  readonly digest: string;
}

/** 解身份三元组（与 W003 Solution Surface 幂等键同构）。 */
export interface SolutionIdentity {
  readonly workspaceKey: string;
  readonly engineId: string;
  readonly solutionId: string;
}

/**
 * PersistedSolution：解身份 + 它指向的修订世系。世系按附加顺序记录去重后的
 * digest 集合；锚点（当前头）由 SessionSurfaceIdentity.restoreAnchor 持有。
 */
export interface PersistedSolution {
  readonly identity: SolutionIdentity;
  readonly lineage: readonly RevisionLineageEntry[];
}

/**
 * 恢复锚点：按 digest 重新挂接一个已持久化的修订世系——绝不按可变指针。
 * 携带解身份三元组，restore 时据此加载对应 PersistedSolution 世系。
 */
export interface SurfaceRestoreAnchor {
  readonly identity: SolutionIdentity;
  readonly revisionId: string;
  readonly digest: string;
}

/**
 * SessionSurfaceIdentity：surface/session 连续性的稳定 id 组——surface id、
 * session id、tab 身份、恢复锚点。全部由解身份确定性派生（可跨进程重新
 * 派生），不含渲染器句柄、不含时间戳（solution-surface.md「Persistence」：
 * 只持久化稳定身份与可移植会话引用）。
 */
export interface SessionSurfaceIdentity {
  readonly surfaceId: string;
  readonly sessionId: string;
  readonly tabId: string;
  readonly anchor: SurfaceRestoreAnchor;
}

/**
 * WorldStore 端口：权威世界/解状态的唯一持久记录（provider-neutral）。
 *
 * 定律（W021「No second authority」）：
 * - save 持久化调用方给出的记录，load 返回与所存字节完全一致的记录——
 *   load(save(rev)) 与 rev 深相等且重新摘要一致；
 * - 世系/身份记录由注册表（registry.ts）维护，store 只原样存取；
 * - 损坏/未知记录以 PersistenceError（typed，code 判别）浮出，绝不静默修复。
 *   适配器实现必须抛 PersistenceError（或携带相同 code 语义的类型化错误）。
 */
export interface WorldStore {
  /** 适配器自报 id（记录进 PersistenceMetadata.storeKind 的来源事实）。 */
  readonly storeKind: string;

  /** 按摘要内容寻址保存修订；同 digest 同字节为幂等 no-op，冲突抛 typed error。 */
  saveRevision(record: PersistedRevision): Promise<void>;
  /** 按稳定摘要加载修订（load-by-digest）；未知 digest 抛 record-not-found。 */
  loadRevision(digest: string): Promise<PersistedRevision>;
  /** 列出已持久修订（按 digest 升序——确定性排序，无时间戳可用）。 */
  listRevisions(): Promise<readonly PersistedRevision[]>;
  /** 保存/替换解记录（身份 + 修订世系；upsert——世系增长由注册表驱动）。 */
  saveSolution(solution: PersistedSolution): Promise<void>;
  /** 按解身份三元组加载；未知身份抛 record-not-found。 */
  loadSolution(identity: SolutionIdentity): Promise<PersistedSolution>;
  /** 列出已持久解（按身份键升序）。 */
  listSolutions(): Promise<readonly PersistedSolution[]>;
  /** 持久化 surface 身份记录（稳定 id + 恢复锚点；upsert）。 */
  saveSurfaceIdentity(identity: SessionSurfaceIdentity): Promise<void>;
  /** 按 tab 身份加载 surface 身份；未知 tabId 抛 record-not-found。 */
  loadSurfaceIdentity(tabId: string): Promise<SessionSurfaceIdentity>;
  /** 列出已持久 surface 身份（按 tabId 升序）。 */
  listSurfaceIdentities(): Promise<readonly SessionSurfaceIdentity[]>;
}
