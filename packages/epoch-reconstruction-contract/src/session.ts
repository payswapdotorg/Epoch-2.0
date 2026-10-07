/**
 * epoch-reconstruction-contract 打开上下文与操作/事件类型。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import { isWorldRevision } from "@zcode/epoch-world-model";

/** 引擎日志出口（宿主注入；引擎不得直接依赖宿主日志实现）。 */
export type ReconstructionLogSink = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
) => void;

/**
 * 重建上下文：open() 时由宿主供给的环境信息。
 *
 * - workspaceKey：工作区身份（身份隔离用 workspaceIdentity，文件操作用
 *   workspacePath——本契约只携带身份键，路径解析属宿主职责）。
 * - signal：协作取消信号（引擎应在长任务上响应它）。
 * - log：结构化日志出口。
 */
export interface ReconstructionContext {
  readonly workspaceKey: string;
  readonly signal?: AbortSignal;
  readonly log?: ReconstructionLogSink;
}

/** 上下文守卫：workspaceKey 必填；signal/log 仅做形状校验。 */
export function isReconstructionContext(value: unknown): value is ReconstructionContext {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.workspaceKey !== "string" || candidate.workspaceKey.length === 0) {
    return false;
  }
  if (candidate.signal !== undefined && typeof (candidate.signal as AbortSignal).aborted !== "boolean") {
    return false;
  }
  if (candidate.log !== undefined && typeof candidate.log !== "function") return false;
  return true;
}

/**
 * 重建操作：作用于会话的变更请求（kind 为引擎定义的开放字符串，
 * payload 为只读记录）。W001 只冻结载体；语义由后续工单收口。
 */
export interface ReconstructionOperation {
  readonly operationId: string;
  readonly kind: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** 操作守卫。 */
export function isReconstructionOperation(value: unknown): value is ReconstructionOperation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.operationId !== "string" || candidate.operationId.length === 0) {
    return false;
  }
  if (typeof candidate.kind !== "string" || candidate.kind.length === 0) return false;
  if (candidate.payload !== undefined) {
    if (typeof candidate.payload !== "object" || candidate.payload === null) return false;
    if (Array.isArray(candidate.payload)) return false;
  }
  return true;
}

/** 会话状态（status 事件载荷）。 */
export const RECONSTRUCTION_SESSION_STATUSES = [
  "opening",
  "open",
  "closing",
  "closed",
  "failed",
] as const;
export type ReconstructionSessionStatus = (typeof RECONSTRUCTION_SESSION_STATUSES)[number];

/** 会话状态守卫。 */
export function isReconstructionSessionStatus(
  value: unknown,
): value is ReconstructionSessionStatus {
  return (
    typeof value === "string" &&
    RECONSTRUCTION_SESSION_STATUSES.includes(value as ReconstructionSessionStatus)
  );
}

/**
 * 重建事件：会话对外通知（revision 世界快照 / status 状态迁移 /
 * error 不可继续错误）。
 */
export type ReconstructionEvent =
  | { readonly type: "revision"; readonly revision: WorldRevision }
  | {
      readonly type: "status";
      readonly status: ReconstructionSessionStatus;
      readonly detail?: string;
    }
  | { readonly type: "error"; readonly message: string };

/** 事件守卫。 */
export function isReconstructionEvent(value: unknown): value is ReconstructionEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "revision":
      return isWorldRevision(candidate.revision);
    case "status":
      if (!isReconstructionSessionStatus(candidate.status)) return false;
      return candidate.detail === undefined || typeof candidate.detail === "string";
    case "error":
      return typeof candidate.message === "string" && candidate.message.length > 0;
    default:
      return false;
  }
}
