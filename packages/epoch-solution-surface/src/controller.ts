/**
 * epoch-solution-surface 生命周期控制器。
 *
 * 依据 spec/architecture/contracts/solution-surface.md「Operations」与 operations.ts
 * 冻结的幂等语义：
 * - open：对同一身份（workspaceKey + engineId + 解析后的 solutionId）幂等——重复 open
 *   返回既有 tab 且 created=false，不调用 engine.open，不复制会话。
 * - activate：激活已激活 tab 为 no-op 成功；未知 tabId 抛错。
 * - close：关闭已关闭/未知 tab 为 no-op 成功（幂等释放），并释放会话资源。
 * - reopen：reopen 一个仍打开的 tab 原样返回（并激活）；未知 tabId 抛错。
 * - list：纯读。
 *
 * 引擎中立：只通过 runtime.registry.get(engineId) 解析引擎，不按 engineId 分支，
 * 不导入引擎实现。持久化语义：内存态只保存稳定身份（tab）+ 可移植会话引用
 * （ReconstructionSession），绝不保存渲染器句柄。
 */
import type {
  ReconstructionContext,
  SolutionActivateRequest,
  SolutionCloseRequest,
  SolutionOpenRequest,
  SolutionOpenResult,
  SolutionReopenRequest,
  SolutionSurfaceIdentity,
  SolutionSurfaceRuntime,
  SolutionSurfaceSessionHandle,
  SolutionSurfaceState,
  SolutionSurfaceTab,
} from "./contract.ts";
import { solutionSurfaceIdentityKey } from "./identity.ts";

interface OpenTabEntry {
  readonly tab: SolutionSurfaceTab;
  readonly handle: SolutionSurfaceSessionHandle;
}

const DEFAULT_TAB_ID_PREFIX = "solution:";

/**
 * Solution Surface 生命周期控制器（生命周期权威）。
 *
 * 通过 SolutionSurfaceRuntime 依赖注入消费引擎注册表与会话工厂；不持有引擎实现引用，
 * 不按 engineId 分支。一个控制器实例对应一个工作区/进程的 Solution Surface 状态。
 */
export class SolutionSurfaceController {
  private readonly runtime: SolutionSurfaceRuntime;
  private readonly tabsById = new Map<string, OpenTabEntry>();
  private readonly tabIdByIdentity = new Map<string, string>();
  private activeTabId: string | null = null;

  constructor(runtime: SolutionSurfaceRuntime) {
    this.runtime = runtime;
  }

  /**
   * 打开一个工程解。幂等：同一身份重复 open 复用既有 tab/会话，返回 created=false。
   *
   * 六步编排（spec「Operations」）：解析引擎 → 解析/创建会话 → 获取世界修订 →
   * 创建/复用 tab → 挂载会话引用 → 激活。会话引用是可移植引用，非渲染器句柄。
   */
  async open(request: SolutionOpenRequest): Promise<SolutionOpenResult> {
    // 1. 解析引擎（注册表是唯一发现路径；未知 id 由注册表抛错——UI 不得静默降级）。
    const engine = this.runtime.registry.get(request.engineId);
    const descriptor = engine.descriptor();

    // 2. 解析 solutionId（幂等键）。request.solutionId 优先；缺省时由 DI 解析器从 input 派生。
    const solutionId = this.resolveSolutionId(request);
    const identity: SolutionSurfaceIdentity = {
      workspaceKey: request.workspaceKey,
      engineId: request.engineId,
      solutionId,
    };
    const sessionId = this.resolveSessionId(identity);

    // 3. 幂等：同一身份已打开 → 复用，不重复 engine.open。
    const identityKey = solutionSurfaceIdentityKey(identity);
    const existingTabId = this.tabIdByIdentity.get(identityKey);
    if (existingTabId) {
      const existing = this.tabsById.get(existingTabId);
      if (existing) {
        this.activeTabId = existing.tab.id;
        const revision = await existing.handle.session.snapshot();
        return {
          tab: existing.tab,
          revision,
          engine: existing.handle.engine.descriptor(),
          created: false,
        };
      }
    }

    // 4. 解析/创建重建会话 + 获取世界修订。
    const context = this.createContext(request.workspaceKey);
    const session = await engine.open(request.input, context);
    const revision = await session.snapshot();

    // 5. 创建 Solution Surface tab（稳定身份 + 可移植会话引用）。
    const tabId = this.createTabId(identity);
    const tab: SolutionSurfaceTab = {
      id: tabId,
      type: "solution",
      workspaceKey: request.workspaceKey,
      ownerTaskId: request.ownerTaskId ?? null,
      engineId: request.engineId,
      sessionId,
      solutionId,
      title: request.title ?? this.defaultTitle(descriptor.name, solutionId),
      openedAt: Date.now(),
    };

    // 6. 挂载（保存会话引用）+ 激活。
    this.tabsById.set(tabId, { tab, handle: { tabId, session, engine } });
    this.tabIdByIdentity.set(identityKey, tabId);
    this.activeTabId = tabId;

    return { tab, revision, engine: descriptor, created: true };
  }

  /** 激活一个已打开的 tab；激活已激活 tab 为 no-op 成功；未知 tabId 抛错。 */
  activate(request: SolutionActivateRequest): SolutionSurfaceTab {
    const entry = this.requireTab(request.tabId);
    this.activeTabId = entry.tab.id;
    return entry.tab;
  }

  /**
   * 关闭一个 tab；关闭已关闭/未知 tab 为 no-op 成功（幂等释放），并释放会话资源。
   * ReconstructionSession.close 由实现保证幂等；这里仍在 finally 中移除身份映射，
   * 确保异常不留下指向已释放会话的孤儿条目。
   */
  async close(request: SolutionCloseRequest): Promise<void> {
    const entry = this.tabsById.get(request.tabId);
    if (!entry) return; // 幂等：已关闭/未知 tab 为 no-op 成功。
    try {
      await entry.handle.session.close();
    } finally {
      this.tabsById.delete(request.tabId);
      this.tabIdByIdentity.delete(
        solutionSurfaceIdentityKey({
          workspaceKey: entry.tab.workspaceKey,
          engineId: entry.tab.engineId,
          solutionId: entry.tab.solutionId,
        }),
      );
      if (this.activeTabId === request.tabId) {
        this.activeTabId = null;
      }
    }
  }

  /**
   * 重开一个仍打开的 tab：原样返回（并激活）；未知 tabId 抛错。
   *
   * 「recent-close/reopen」的 UI 侧恢复由继承的 side-pane 生命周期
   * （restoreSidePaneTab）承接；控制器层 reopen 是对仍打开 tab 的幂等再激活。
   */
  reopen(request: SolutionReopenRequest): SolutionSurfaceTab {
    const entry = this.requireTab(request.tabId);
    this.activeTabId = entry.tab.id;
    return entry.tab;
  }

  /** 列出全部 Solution Surface tab + 活动 tab（纯读，按 openedAt 稳定排序）。 */
  list(): SolutionSurfaceState {
    const tabs = [...this.tabsById.values()].map((entry) => entry.tab);
    tabs.sort((a, b) => a.openedAt - b.openedAt);
    return { tabs, activeTabId: this.activeTabId };
  }

  private requireTab(tabId: string): OpenTabEntry {
    const entry = this.tabsById.get(tabId);
    if (!entry) {
      throw new Error(`solution surface tab not found: ${tabId}`);
    }
    return entry;
  }

  private resolveSolutionId(request: SolutionOpenRequest): string {
    if (request.solutionId && request.solutionId.length > 0) return request.solutionId;
    const resolved = this.runtime.resolveSolutionId?.(request);
    if (!resolved || resolved.length === 0) {
      throw new Error(
        "solution open requires a stable solutionId: provide request.solutionId or runtime.resolveSolutionId",
      );
    }
    return resolved;
  }

  private resolveSessionId(identity: SolutionSurfaceIdentity): string {
    return (
      this.runtime.resolveSessionId?.(identity) ?? `${identity.engineId}:${identity.solutionId}`
    );
  }

  private createContext(workspaceKey: string): ReconstructionContext {
    return (
      this.runtime.createReconstructionContext?.(workspaceKey) ?? {
        workspaceKey,
      }
    );
  }

  private createTabId(identity: SolutionSurfaceIdentity): string {
    // 默认 tab id 必须跨工作区唯一：身份三元组（workspaceKey+engineId+solutionId）
    // 共同编码，避免不同工作区同一 engine+solution 的 tab 互相覆盖。
    return (
      this.runtime.createTabId?.(identity) ??
      `${DEFAULT_TAB_ID_PREFIX}${encodeURIComponent(identity.workspaceKey)}:${encodeURIComponent(identity.engineId)}:${encodeURIComponent(identity.solutionId)}`
    );
  }

  private defaultTitle(engineName: string, solutionId: string): string {
    return `${engineName} · ${solutionId}`;
  }
}
