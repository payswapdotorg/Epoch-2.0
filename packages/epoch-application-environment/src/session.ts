/**
 * epoch-application-environment 会话契约：观察/控制/语义三平面分离的生命周期。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md「separate
 * observation/control/semantic planes」「observe-only, suggest, confirmation
 * and bounded-autonomy modes」与验收点 4：read/observe 权限永不隐式授予
 * mutation。
 *
 * EnvironmentSession 是 provider 在 attach 之后产出的会话引用；它把 observe/
 * control/semantic 三组操作显式分开，并要求每条操作带 initiator。surface/
 * host 在调用前用 modeAllowsPlane() + capability plane availability 校验；
 * observe-only 模式下 control/semantic 调用被拒绝。
 */
import type { AutonomyMode, CapabilityPlane } from "./capability.ts";
import { modeAllowsPlane } from "./capability.ts";
import type { OperationInitiator } from "./descriptor.ts";
import type { SensitiveDataPolicy } from "./privacy.ts";
import type { EnvironmentHealthSnapshot, EnvironmentSessionStatus } from "./status.ts";
import type { EnvironmentDescriptor } from "./descriptor.ts";

/**
 * 一次操作调用的请求基类（observe/control/semantic 都用它）。
 *
 * `initiator`：human / agent。surface/host 必须显式提供；provider 不允许
 * 自行假定。`plane`：调用的能力平面。`operation`：该平面下的子操作名
 * （来自 descriptor.planes[].operations）。`payload`：操作参数（provider 自
 * 定义形状，surface 不解释）。`requestId`：调用方生成，用于幂等与回放。
 */
export interface EnvironmentOperationRequest {
  readonly plane: CapabilityPlane;
  readonly operation: string;
  readonly initiator: OperationInitiator;
  readonly payload: unknown;
  readonly requestId: string;
}

/**
 * 操作结果：成功/失败/被拒绝。被拒绝时 reasonCode 给出：
 * - mode-denied：observe-only 模式调用 control（验收点 4）。
 * - capability-unavailable：plane available=false（远端离线/源 gap；验收点 7）。
 * - permission-denied：surface/host 主动拒绝授权（验收点 7）。
 * - not-supported：descriptor 未声明该 operation。
 * - sensitive-filtered：操作涉及的内容被敏感数据策略过滤（验收点 5）。
 */
export type EnvironmentOperationResult =
  | { readonly status: "ok"; readonly data: unknown }
  | { readonly status: "failed"; readonly reasonCode: string; readonly message: string }
  | {
      readonly status: "denied";
      readonly reasonCode:
        | "mode-denied"
        | "capability-unavailable"
        | "permission-denied"
        | "not-supported"
        | "sensitive-filtered";
      readonly message: string;
      readonly plane: CapabilityPlane;
      readonly operation: string;
    };

/**
 * EnvironmentSession：attach 之后产出的会话引用。
 *
 * provider 实现此接口。surface/host 经此接口调用 observe/control/semantic
 * 三平面操作；每条调用都经过 mode + capability 双重门控。
 *
 * observe / control / semantic 三方法显式分离——provider 不能合并；surface
 * 按平面分别应用 mode 校验。`status()` 暴露会话状态与健康快照（验收点：
 * visible attach/detach/observation status）。
 *
 * `detach()` 由 surface 在 close tab 时调用，幂等释放。provider 实现需保证
 * detach 幂等（已 detached 再次调用为 no-op 成功）。
 *
 * `onLostConnection?`：可选订阅；会话进入 lost/degraded 时由 provider 主动
 * 通知 surface。surface 不依赖定时器轮询——provider 的事件是状态权威。
 */
export interface EnvironmentSession {
  /** 该会话 attach 的 descriptor 引用（surface 通过它做能力校验）。 */
  readonly descriptor: EnvironmentDescriptor;
  /** attach 时解析的 mode（surface 校验后冻结）。 */
  readonly mode: AutonomyMode;
  /** attach 时解析的敏感数据策略（surface 校验后冻结）。 */
  readonly sensitiveDataPolicy: SensitiveDataPolicy;
  /** attach 时解析的 ownerTaskId（用于 task/session context 共享；验收点 3）。 */
  readonly ownerTaskId: string | null;
  /** 该会话绑定的 workspaceKey（与 side-pane tab 同级隔离）。 */
  readonly workspaceKey: string;
  /** attach 时分配的会话 id（surface 在 attach 时生成，幂等键之一）。 */
  readonly sessionId: string;

  /** 同步读取当前状态 + 健康快照。 */
  status(): EnvironmentHealthSnapshot;
  /** observe plane 操作（不改变远端状态；mode 不限制 observe plane）。 */
  observe(request: EnvironmentOperationRequest): Promise<EnvironmentOperationResult>;
  /** control plane 操作（受 mode + capability 双重门控；验收点 4）。 */
  control(request: EnvironmentOperationRequest): Promise<EnvironmentOperationResult>;
  /** semantic plane 操作（受 mode + capability 双重门控）。 */
  semantic(request: EnvironmentOperationRequest): Promise<EnvironmentOperationResult>;
  /** 显式 detach；幂等释放。detach 后再调用 observe/control/semantic 返回 denied(reason=permission-denied)。 */
  detach(): Promise<void>;
  /** 订阅 lost/stale 事件（可选；provider 主动通知 surface）。 */
  onLostConnection?(handler: (snapshot: EnvironmentHealthSnapshot) => void): () => void;
}

/**
 * 在 surface 调用 session.observe/control/semantic 前做的 mode + capability
 * 双重门控。返回 EnvironmentOperationResult.status="denied" 表示拒绝；
 * 返回 status="ok" 时仍要交给 provider 真正执行（本函数只做契约侧门控）。
 *
 * 验收点 4：observe-only 模式永远拒绝 control/semantic（即使 descriptor 声明
 * 该 plane available=true）。
 * 验收点 7：lost/stale 状态下，session.status().unavailablePlanes 包含的
 * plane 也被拒绝（动态健康快照优先于 descriptor 的静态 available 标志——
 * descriptor 是声明，session.status() 是事实）。
 */
export function precheckOperation(
  session: Pick<EnvironmentSession, "descriptor" | "mode" | "sensitiveDataPolicy" | "status">,
  request: EnvironmentOperationRequest,
): EnvironmentOperationResult | null {
  const planeDecl = session.descriptor.planes.find((p) => p.plane === request.plane);
  if (!planeDecl) {
    return {
      status: "denied",
      reasonCode: "not-supported",
      message: `plane ${request.plane} not declared by provider`,
      plane: request.plane,
      operation: request.operation,
    };
  }
  if (!planeDecl.operations.includes(request.operation)) {
    return {
      status: "denied",
      reasonCode: "not-supported",
      message: `operation ${request.operation} not in plane ${request.plane}`,
      plane: request.plane,
      operation: request.operation,
    };
  }
  // 动态健康快照优先：session.status().unavailablePlanes 包含的 plane 视为
  // 当前不可用（lost/stale 把 control plane 标为 unavailable——验收点 7）。
  // 静态 planeDecl.available=false 也走同路径（source-gap / provider 声明）。
  const dynamicHealth = session.status();
  const dynamicallyUnavailable = dynamicHealth.unavailablePlanes.includes(request.plane);
  if (!planeDecl.available || dynamicallyUnavailable) {
    return {
      status: "denied",
      reasonCode: "capability-unavailable",
      message: dynamicallyUnavailable
        ? `plane ${request.plane} currently unavailable via health snapshot (${dynamicHealth.reason ?? "no reason"})`
        : `plane ${request.plane} currently unavailable (lost/denied/source-gap)`,
      plane: request.plane,
      operation: request.operation,
    };
  }
  if (request.initiator === "agent" && !modeAllowsPlane(session.mode, request.plane)) {
    return {
      status: "denied",
      reasonCode: "mode-denied",
      message: `mode ${session.mode} does not allow agent access to plane ${request.plane}`,
      plane: request.plane,
      operation: request.operation,
    };
  }
  return null;
}

/**
 * 会话当前是否仍 attach（status === "attached"）。surface 用此判幂等 detach。
 */
export function isSessionActive(session: EnvironmentSession): boolean {
  return session.status().status === "attached";
}

/** 类型再导出，便于外部单点导入。 */
export type { EnvironmentSessionStatus } from "./status.ts";
