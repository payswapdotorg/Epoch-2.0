/**
 * epoch-solution-contract Surface 操作类型。
 *
 * 依据 spec/architecture/contracts/solution-surface.md「Operations」：
 * solution.open / activate / close / reopen / list。
 *
 * 幂等语义（冻结）：
 * - open：对同一身份（workspaceKey + engineId + 解析后的 solutionId）幂等——
 *   重复 open 返回既有 tab 且 created=false，不复制 tab/会话；
 *   未显式给 solutionId 时由引擎从输入解析稳定 id。
 * - activate：激活已激活 tab 为 no-op 成功；未知 tabId 报错。
 * - close：关闭已关闭/未知 tab 为 no-op 成功（幂等释放）。
 * - reopen：reopen 一个已打开的 tab 原样返回；未知 tabId 报错。
 * - list：纯读操作。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import { isWorldRevision } from "@zcode/epoch-world-model";
import type { ReconstructionInput } from "@zcode/epoch-reconstruction-contract";
import { isReconstructionInput } from "@zcode/epoch-reconstruction-contract";
import type { SolutionSurfaceTab } from "./tab.ts";
import { isSolutionSurfaceTab } from "./tab.ts";
import type { SolutionEngineMetadata } from "./engine-metadata.ts";
import { isSolutionEngineMetadata } from "./engine-metadata.ts";

/** 操作种类判别值（冻结集合）。 */
export const SOLUTION_SURFACE_OPERATION_KINDS = [
  "solution.open",
  "solution.activate",
  "solution.close",
  "solution.reopen",
  "solution.list",
] as const;
export type SolutionSurfaceOperationKind = (typeof SOLUTION_SURFACE_OPERATION_KINDS)[number];

/**
 * 打开请求：解析引擎 -> 引擎 open -> 世界修订 -> 创建/复用 tab -> 挂载 ->
 * 激活（spec 的六步由宿主运行时编排，这里只冻结请求形态）。
 */
export interface SolutionOpenRequest {
  readonly workspaceKey: string;
  readonly engineId: string;
  readonly input: ReconstructionInput;
  /** 显式解身份（缺省由引擎从 input 解析稳定 id）。 */
  readonly solutionId?: string;
  readonly title?: string;
  readonly ownerTaskId?: string | null;
}

/** 打开结果：幂等标记 created=false 表示复用既有 tab/会话。 */
export interface SolutionOpenResult {
  readonly tab: SolutionSurfaceTab;
  readonly revision: WorldRevision;
  readonly engine: SolutionEngineMetadata;
  readonly created: boolean;
}

/** 激活请求。 */
export interface SolutionActivateRequest {
  readonly tabId: string;
}

/** 关闭请求。 */
export interface SolutionCloseRequest {
  readonly tabId: string;
}

/** 重开请求。 */
export interface SolutionReopenRequest {
  readonly tabId: string;
  readonly ownerTaskId?: string | null;
}

/** 操作判别联合（宿主/agent 统一分发形态）。 */
export type SolutionSurfaceOperation =
  | { readonly kind: "solution.open"; readonly request: SolutionOpenRequest }
  | { readonly kind: "solution.activate"; readonly request: SolutionActivateRequest }
  | { readonly kind: "solution.close"; readonly request: SolutionCloseRequest }
  | { readonly kind: "solution.reopen"; readonly request: SolutionReopenRequest }
  | { readonly kind: "solution.list" };

/** 打开请求守卫。 */
export function isSolutionOpenRequest(value: unknown): value is SolutionOpenRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.workspaceKey !== "string" || candidate.workspaceKey.length === 0) {
    return false;
  }
  if (typeof candidate.engineId !== "string" || candidate.engineId.length === 0) return false;
  if (!isReconstructionInput(candidate.input)) return false;
  if (candidate.solutionId !== undefined && typeof candidate.solutionId !== "string") {
    return false;
  }
  if (candidate.title !== undefined && typeof candidate.title !== "string") return false;
  if (
    candidate.ownerTaskId !== undefined &&
    candidate.ownerTaskId !== null &&
    typeof candidate.ownerTaskId !== "string"
  ) {
    return false;
  }
  return true;
}

/** 打开结果守卫。 */
export function isSolutionOpenResult(value: unknown): value is SolutionOpenResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isSolutionSurfaceTab(candidate.tab)) return false;
  if (!isWorldRevision(candidate.revision)) return false;
  if (!isSolutionEngineMetadata(candidate.engine)) return false;
  if (typeof candidate.created !== "boolean") return false;
  return true;
}

/** tab 定位请求守卫（activate/close/reopen 共用形态）。 */
export function isSolutionTabRequest(value: unknown): value is
  | SolutionActivateRequest
  | SolutionCloseRequest
  | SolutionReopenRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.tabId !== "string" || candidate.tabId.length === 0) return false;
  if (
    candidate.ownerTaskId !== undefined &&
    candidate.ownerTaskId !== null &&
    typeof candidate.ownerTaskId !== "string"
  ) {
    return false;
  }
  return true;
}

/** 操作守卫：kind 必须属于冻结集合且 request 形态正确。 */
export function isSolutionSurfaceOperation(value: unknown): value is SolutionSurfaceOperation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case "solution.open":
      return isSolutionOpenRequest(candidate.request);
    case "solution.activate":
    case "solution.close":
    case "solution.reopen":
      return isSolutionTabRequest(candidate.request);
    case "solution.list":
      return true;
    default:
      return false;
  }
}
