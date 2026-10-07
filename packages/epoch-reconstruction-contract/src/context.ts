/**
 * epoch-reconstruction-contract 打开上下文。
 */

/** 引擎日志出口（宿主注入；引擎不得直接依赖宿主日志实现）。 */
export type ReconstructionLogSink = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
) => void;

/**
 * 重建上下文：open() 时由宿主供给的环境信息。
 *
 * - workspaceKey：工作区身份键（身份隔离用 workspaceIdentity；路径解析属
 *   宿主职责，本契约只携带身份键）。
 * - signal：协作取消信号（引擎应在长任务上响应它）。
 * - log：结构化日志出口。
 */
export interface ReconstructionContext {
  readonly workspaceKey: string;
  readonly signal?: AbortSignal;
  readonly log?: ReconstructionLogSink;
}

function isAbortSignalLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function"
  );
}

/** 上下文守卫：workspaceKey 必填；signal/log 仅做形状校验。 */
export function isReconstructionContext(value: unknown): value is ReconstructionContext {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.workspaceKey !== "string" || candidate.workspaceKey.length === 0) {
    return false;
  }
  if (candidate.signal !== undefined && !isAbortSignalLike(candidate.signal)) return false;
  if (candidate.log !== undefined && typeof candidate.log !== "function") return false;
  return true;
}
