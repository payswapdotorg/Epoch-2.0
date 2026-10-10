/**
 * epoch-environment-surface 生命周期控制器。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md 与验收点 2/6：
 * - open：通过 descriptor 注册的 provider 调用 attach()；同一身份重复 open
 *   复用既有 tab/会话，返回 created=false，不重复 attach。
 * - activate：激活已激活 tab 为 no-op 成功；未知 tabId 抛错。
 * - close：detach 会话并移除 tab；关闭已关闭/未知 tab 为 no-op 成功（幂等释放）。
 * - list：纯读，按 openedAt 稳定排序。
 *
 * Provider 中立：只通过 runtime.registry.resolve(providerId) 解析 provider，
 * 不按 providerId 分支，不导入 provider 实现。一个控制器实例对应一个工作区
 * 的 Application Environment Surface 状态。表面类型固定为
 * "application-environment"——新增 provider 不需要新 surface 类型（验收点 2）。
 *
 * 验收点 6：controller 不触碰 Browser/Terminal 的 side-pane 模型；它是并列
 * 的一种 surface 类型，继承的 side-pane 仍按 type=browser/terminal 分派。
 */
import {
  DEFAULT_SENSITIVE_DATA_POLICY,
  isModeCompatibleWithDescriptor,
  precheckOperation,
  type AutonomyMode,
  type EnvironmentAttachRequest,
  type EnvironmentDescriptor,
  type EnvironmentHealthSnapshot,
  type EnvironmentOperationResult,
  type SensitiveDataPolicy,
} from "@zcode/epoch-application-environment";
import type {
  EnvironmentSurfaceActivateRequest,
  EnvironmentSurfaceCloseRequest,
  EnvironmentSurfaceIdentity,
  EnvironmentSurfaceOpenRequest,
  EnvironmentSurfaceOpenResult,
  EnvironmentSurfaceOperationCall,
  EnvironmentSurfaceRuntime,
  EnvironmentSurfaceState,
  EnvironmentSurfaceTab,
} from "./contract.ts";
import { environmentSurfaceIdentityKey } from "./identity.ts";

interface OpenTabEntry {
  readonly tab: EnvironmentSurfaceTab;
  readonly session: import("@zcode/epoch-application-environment").EnvironmentSession;
  readonly descriptor: EnvironmentDescriptor;
}

const DEFAULT_TAB_ID_PREFIX = "environment:";

/**
 * Application Environment Surface 生命周期控制器（生命周期权威）。
 *
 * 通过 EnvironmentSurfaceRuntime 依赖注入消费 EnvironmentRegistry 与 provider
 * attach()；不持有 provider 实现引用，不按 providerId 分支。一个控制器实例对应
 * 一个工作区/进程的 Application Environment Surface 状态。
 */
export class EnvironmentSurfaceController {
  private readonly runtime: EnvironmentSurfaceRuntime;
  private readonly tabsById = new Map<string, OpenTabEntry>();
  private readonly tabIdByIdentity = new Map<string, string>();
  private activeTabId: string | null = null;

  constructor(runtime: EnvironmentSurfaceRuntime) {
    this.runtime = runtime;
  }

  /**
   * 打开（attach）一个 Application Environment 会话。幂等：同一身份重复 open
   * 复用既有 tab/会话，返回 created=false。
   *
   * 五步编排：解析 provider → 校验 mode 与 descriptor 兼容 → 解析/创建会话 →
   * 创建/复用 tab → 激活。会话引用是可移植引用，非 adapter 句柄。
   */
  async open(request: EnvironmentSurfaceOpenRequest): Promise<EnvironmentSurfaceOpenResult> {
    // 1. 解析 provider（注册表是唯一发现路径；未知 id 由注册表抛错——不静默降级）。
    const provider = this.runtime.registry.resolve(request.providerId);
    const descriptor = provider.descriptor();

    // 2. 校验 mode 与 descriptor 兼容（mode rank ≤ maxAutonomyMode rank）。
    if (!isModeCompatibleWithDescriptor(descriptor.maxAutonomyMode, request.mode)) {
      throw new Error(
        `attach mode ${request.mode} exceeds provider ${descriptor.id} maxAutonomyMode ${descriptor.maxAutonomyMode}`,
      );
    }
    // sensitive-data policy 不得宽于 descriptor 的 needs（验收点 5）。
    this.assertSensitivePolicySatisfiesDescriptor(
      request.sensitiveDataPolicy ?? DEFAULT_SENSITIVE_DATA_POLICY,
      descriptor,
    );

    // 3. 幂等：同一身份已打开 → 复用，不重复 attach。
    const identity: EnvironmentSurfaceIdentity = {
      workspaceKey: request.workspaceKey,
      providerId: request.providerId,
      initiator: request.initiator,
      ownerTaskId: request.ownerTaskId ?? null,
    };
    const identityKey = environmentSurfaceIdentityKey(identity);
    const existingTabId = this.tabIdByIdentity.get(identityKey);
    if (existingTabId) {
      const existing = this.tabsById.get(existingTabId);
      if (existing) {
        this.activeTabId = existing.tab.id;
        return {
          tab: existing.tab,
          descriptor: existing.descriptor,
          health: existing.session.status(),
          created: false,
        };
      }
    }

    // 4. attach → 产出 EnvironmentSession。
    const sessionId = this.createSessionId(identity);
    const attachRequest: EnvironmentAttachRequest = {
      workspaceKey: request.workspaceKey,
      providerId: request.providerId,
      mode: request.mode,
      initiator: request.initiator,
      ...(request.sensitiveDataPolicy ? { sensitiveDataPolicy: request.sensitiveDataPolicy } : {}),
      ...(request.ownerTaskId !== undefined ? { ownerTaskId: request.ownerTaskId } : {}),
      ...(request.remoteHost !== undefined ? { remoteHost: request.remoteHost } : {}),
    };
    const session = await provider.attach(attachRequest);

    // 5. 创建 Surface tab（稳定身份 + 可移植会话引用标识）+ 激活。
    const tabId = this.createTabId(identity);
    const tab: EnvironmentSurfaceTab = {
      id: tabId,
      type: "application-environment",
      workspaceKey: request.workspaceKey,
      ownerTaskId: request.ownerTaskId ?? null,
      providerId: request.providerId,
      sessionId,
      initiator: request.initiator,
      mode: request.mode,
      simulation: descriptor.simulation,
      title:
        request.title?.trim() || this.defaultTitle(descriptor, request.mode, descriptor.simulation),
      openedAt: Date.now(),
    };

    this.tabsById.set(tabId, { tab, session, descriptor });
    this.tabIdByIdentity.set(identityKey, tabId);
    this.activeTabId = tabId;

    return { tab, descriptor, health: session.status(), created: true };
  }

  /** 激活一个已打开的 tab；激活已激活 tab 为 no-op 成功；未知 tabId 抛错。 */
  activate(request: EnvironmentSurfaceActivateRequest): EnvironmentSurfaceTab {
    const entry = this.requireTab(request.tabId);
    this.activeTabId = entry.tab.id;
    return entry.tab;
  }

  /**
   * 关闭一个 tab；detach 会话并移除 tab。关闭已关闭/未知 tab 为 no-op 成功
   * （幂等释放）。detach 由 provider 保证幂等；这里仍在 finally 中移除身份
   * 映射，确保异常不留下指向已释放会话的孤儿条目。
   */
  async close(request: EnvironmentSurfaceCloseRequest): Promise<void> {
    const entry = this.tabsById.get(request.tabId);
    if (!entry) return; // 幂等：已关闭/未知 tab 为 no-op 成功。
    try {
      await entry.session.detach();
    } finally {
      this.tabsById.delete(request.tabId);
      this.tabIdByIdentity.delete(
        environmentSurfaceIdentityKey({
          workspaceKey: entry.tab.workspaceKey,
          providerId: entry.tab.providerId,
          initiator: entry.tab.initiator,
          ownerTaskId: entry.tab.ownerTaskId,
        }),
      );
      if (this.activeTabId === request.tabId) {
        this.activeTabId = null;
      }
    }
  }

  /** 列出全部 Application Environment Surface tab + 活动 tab（纯读）。 */
  list(): EnvironmentSurfaceState {
    const tabs = [...this.tabsById.values()].map((entry) => entry.tab);
    tabs.sort((a, b) => a.openedAt - b.openedAt);
    return { tabs, activeTabId: this.activeTabId };
  }

  /**
   * 在一个已 attach 的会话上调用操作（observe/control/semantic）。
   *
   * 控制器先做 mode + capability 双重门控（precheckOperation），再交由
   * provider 的 session 执行。验收点 4：observe-only 模式永远拒绝 control/
   * semantic（即使 descriptor 声明该 plane available=true）。
   *
   * controller 层不缓存结果——每次调用都直达 session（provider 的状态权威）。
   */
  async call(call: EnvironmentSurfaceOperationCall): Promise<EnvironmentOperationResult> {
    const entry = this.tabsById.get(call.tabId);
    if (!entry) {
      return {
        status: "denied",
        reasonCode: "permission-denied",
        message: `tab not found: ${call.tabId}`,
        plane: call.request.plane,
        operation: call.request.operation,
      };
    }
    const precheck = precheckOperation(
      {
        descriptor: entry.descriptor,
        mode: entry.session.mode,
        sensitiveDataPolicy: entry.session.sensitiveDataPolicy,
        status: entry.session.status,
      },
      call.request,
    );
    if (precheck) return precheck;
    if (call.request.plane === "observe") {
      return entry.session.observe(call.request);
    }
    if (call.request.plane === "control") {
      return entry.session.control(call.request);
    }
    return entry.session.semantic(call.request);
  }

  /** 读取一个 tab 的会话当前健康快照（visible attach/detach/observation status）。 */
  healthOf(tabId: string): EnvironmentHealthSnapshot {
    const entry = this.tabsById.get(tabId);
    if (!entry) {
      return {
        status: "detached",
        health: "unreachable",
        unavailablePlanes: [],
        reason: `tab not found: ${tabId}`,
      };
    }
    return entry.session.status();
  }

  /** 订阅 tab 的 lost/stale 事件（provider 主动通知）。 */
  subscribeToLostConnection(
    tabId: string,
    handler: (snapshot: EnvironmentHealthSnapshot) => void,
  ): () => void {
    const entry = this.tabsById.get(tabId);
    if (!entry || !entry.session.onLostConnection) return () => {};
    return entry.session.onLostConnection(handler);
  }

  /** 缺省的 mode + simulation 标签（标题）。 */
  private defaultTitle(
    descriptor: EnvironmentDescriptor,
    mode: AutonomyMode,
    simulation: boolean,
  ): string {
    const simPrefix = simulation ? "[simulated] " : "";
    return `${simPrefix}${descriptor.name} · ${mode}`;
  }

  private assertSensitivePolicySatisfiesDescriptor(
    policy: SensitiveDataPolicy,
    descriptor: EnvironmentDescriptor,
  ): void {
    // 验收点 5：surface 不能比 descriptor 的 sensitiveDataNeeds 更宽。
    const RANK: Readonly<Record<string, number>> = {
      "default-exclude": 0,
      "task-scoped": 1,
      "explicit-allowlist": 1,
      "full-trust": 2,
    };
    const policyRank = RANK[policy.scope] ?? 0;
    const needRank = RANK[descriptor.sensitiveDataNeeds] ?? 0;
    if (policyRank > needRank) {
      throw new Error(
        `sensitive data policy ${policy.scope} exceeds provider ${descriptor.id} sensitiveDataNeeds ${descriptor.sensitiveDataNeeds}`,
      );
    }
    if (policy.excludeCredentials === false && descriptor.sensitiveDataNeeds !== "full-trust") {
      throw new Error(
        `excludeCredentials=false requires provider ${descriptor.id} to declare sensitiveDataNeeds=full-trust`,
      );
    }
  }

  private requireTab(tabId: string): OpenTabEntry {
    const entry = this.tabsById.get(tabId);
    if (!entry) {
      throw new Error(`application environment surface tab not found: ${tabId}`);
    }
    return entry;
  }

  private createSessionId(identity: EnvironmentSurfaceIdentity): string {
    return (
      this.runtime.createSessionId?.(identity) ??
      `${identity.providerId}:${identity.workspaceKey}:${identity.initiator}:${
        identity.ownerTaskId ?? ""
      }`
    );
  }

  private createTabId(identity: EnvironmentSurfaceIdentity): string {
    // 默认 tab id 必须跨工作区唯一：身份四元组共同编码。
    return (
      this.runtime.createTabId?.(identity) ??
      `${DEFAULT_TAB_ID_PREFIX}${encodeURIComponent(identity.workspaceKey)}:${encodeURIComponent(
        identity.providerId,
      )}:${identity.initiator}:${encodeURIComponent(identity.ownerTaskId ?? "")}`
    );
  }
}
