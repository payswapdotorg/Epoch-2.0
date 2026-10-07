/**
 * epoch-reconstruction-contract 重建操作与会话事件。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import { isWorldRevision } from "@zcode/epoch-world-model";

/**
 * 重建操作：作用于会话的变更请求。kind 为引擎定义的开放字符串，
 * payload 为只读记录；W001 只冻结载体，操作语义由后续工单收口。
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
 * 重建事件：会话对外通知。
 * - revision：新的世界快照；
 * - status：会话状态迁移；
 * - error：不可继续的错误。
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
