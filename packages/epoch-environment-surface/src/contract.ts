/**
 * epoch-environment-surface 公开契约：通用 Application Environment Surface
 * 生命周期控制器的 DI 运行时边界与对外类型面。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md「generic
 * surface registration with no per-vendor surface types」与验收点 2：provider
 * 通过 descriptor 注册而非新增 workbench surface 类型。
 *
 * 控制器是 Application Environment Surface 的生命周期权威
 * （open/activate/close/list），通过依赖注入消费 EnvironmentRegistry 与
 * EnvironmentProvider.attach()——不导入任何 provider 实现，不按 providerId
 * 分支。内存态只保存稳定身份（EnvironmentSurfaceTab）+ 可移植会话引用
 * （EnvironmentSession），绝不保存 adapter 句柄。
 */
import type {
  EnvironmentAttachRequest,
  EnvironmentDescriptor,
  EnvironmentHealthSnapshot,
  EnvironmentOperationRequest,
  EnvironmentOperationResult,
  EnvironmentRegistry,
  EnvironmentSession,
} from "@zcode/epoch-application-environment";
import type { EnvironmentSessionIdentity } from "@zcode/epoch-application-environment";

/**
 * Surface 稳定身份——幂等 open 的判别键。从 EnvironmentAttachRequest +
 * surface 解析后的 sessionId 派生。
 *
 * 与 environmentSessionIdentityKey 同语义：workspaceKey + providerId +
 * initiator + ownerTaskId。
 */
export type EnvironmentSurfaceIdentity = EnvironmentSessionIdentity;

/**
 * Surface runtime 依赖（依赖注入）。
 *
 * 宿主（W005/W006 或继承的 side-pane 宿主）注入已组装的 EnvironmentRegistry
 * 与 sessionId 工厂；控制器不发现 provider、不构造 sensitive-data policy、不
 * 解析 remote host——它只经 registry.resolve(providerId) 取 provider，校验
 * mode 与 descriptor 兼容，再 provider.attach() 产出 EnvironmentSession。
 */
export interface EnvironmentSurfaceRuntime {
  /** provider 注册表：surface 解析 provider 的唯一发现路径。 */
  readonly registry: EnvironmentRegistry;
  /** 可选的 sessionId 工厂；缺省时控制器用身份派生。 */
  readonly createSessionId?: (identity: EnvironmentSurfaceIdentity) => string;
  /** 可选的 tab id 工厂；缺省时控制器用确定性前缀派生。 */
  readonly createTabId?: (identity: EnvironmentSurfaceIdentity) => string;
}

/**
 * Surface tab（稳定身份 + 可移植会话引用标识）。与 Browser/Terminal/Solution
 * tab 同级——是 WorkspaceSidePaneTab 联合的一个分支。adapter 句柄不在其中。
 */
export interface EnvironmentSurfaceTab {
  readonly id: string;
  readonly type: "application-environment";
  readonly workspaceKey: string;
  readonly ownerTaskId: string | null;
  readonly providerId: string;
  readonly sessionId: string;
  readonly initiator: "human" | "agent";
  readonly mode: import("@zcode/epoch-application-environment").AutonomyMode;
  readonly simulation: boolean;
  readonly title: string;
  readonly openedAt: number;
}

/** Surface 全量快照（list 返回）。 */
export interface EnvironmentSurfaceState {
  readonly tabs: readonly EnvironmentSurfaceTab[];
  readonly activeTabId: string | null;
}

/** Open 请求——携带 attach 参数 + 可选 tab 展示字段。 */
export type EnvironmentSurfaceOpenRequest = EnvironmentAttachRequest & {
  readonly title?: string;
};

/** Open 结果——含 descriptor（用于 UI 展示与 mode 校验）+ 会话初始健康快照。 */
export interface EnvironmentSurfaceOpenResult {
  readonly tab: EnvironmentSurfaceTab;
  readonly descriptor: EnvironmentDescriptor;
  readonly health: EnvironmentHealthSnapshot;
  readonly created: boolean;
}

/** Activate 请求：把已 attach 的 tab 设为活动。 */
export interface EnvironmentSurfaceActivateRequest {
  readonly tabId: string;
}

/** Close 请求：detach 会话并移除 tab。 */
export interface EnvironmentSurfaceCloseRequest {
  readonly tabId: string;
}

/** List 请求：列出全部 tab + 活动 tab。 */
export type EnvironmentSurfaceListRequest = Record<string, never>;

/** 操作调用请求——把 EnvironmentOperationRequest 与目标 tab 绑定。 */
export interface EnvironmentSurfaceOperationCall {
  readonly tabId: string;
  readonly request: EnvironmentOperationRequest;
}

export type { EnvironmentOperationRequest, EnvironmentOperationResult, EnvironmentSession };

export type {
  EnvironmentAttachRequest,
  EnvironmentDescriptor,
  EnvironmentHealthSnapshot,
  EnvironmentRegistry,
  EnvironmentSessionIdentity,
};
