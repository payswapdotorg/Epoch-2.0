/**
 * epoch-solution-contract Solution Surface 身份。
 *
 * 依据 spec/architecture/contracts/solution-surface.md「Identity」：
 * Solution 是与 Browser/Terminal 同级的一等工位面；字段与语义强制。
 * Surface 不是语义世界事实的拥有者（authority-map）。
 */

/** Solution Surface 的 tab 类型判别值（唯一合法 type）。 */
export const SOLUTION_SURFACE_TAB_TYPE = "solution" as const;

/**
 * Solution Surface tab：工作区内一个已打开的工程解的身份。
 *
 * - id：tab 身份（工位面侧）。
 * - workspaceKey：工作区身份键（隔离/去重/绑定按 workspaceIdentity）。
 * - ownerTaskId：归属任务（可空——非任务打开的解）。
 * - engineId/sessionId/solutionId：解的重建三元组（引擎、会话、解身份）。
 * - openedAt：打开时间戳（epoch ms）。
 */
export interface SolutionSurfaceTab {
  readonly id: string;
  readonly type: "solution";
  readonly workspaceKey: string;
  readonly ownerTaskId?: string | null;
  readonly engineId: string;
  readonly sessionId: string;
  readonly solutionId: string;
  readonly title: string;
  readonly openedAt: number;
}

/** tab 守卫：type 必须为 "solution"，必填字段类型正确。 */
export function isSolutionSurfaceTab(value: unknown): value is SolutionSurfaceTab {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (candidate.type !== SOLUTION_SURFACE_TAB_TYPE) return false;
  if (typeof candidate.workspaceKey !== "string" || candidate.workspaceKey.length === 0) {
    return false;
  }
  if (
    candidate.ownerTaskId !== undefined &&
    candidate.ownerTaskId !== null &&
    typeof candidate.ownerTaskId !== "string"
  ) {
    return false;
  }
  if (typeof candidate.engineId !== "string" || candidate.engineId.length === 0) return false;
  if (typeof candidate.sessionId !== "string" || candidate.sessionId.length === 0) return false;
  if (typeof candidate.solutionId !== "string" || candidate.solutionId.length === 0) return false;
  if (typeof candidate.title !== "string" || candidate.title.length === 0) return false;
  if (
    typeof candidate.openedAt !== "number" ||
    !Number.isFinite(candidate.openedAt) ||
    !Number.isInteger(candidate.openedAt) ||
    candidate.openedAt < 0
  ) {
    return false;
  }
  return true;
}

/** 工位面状态：已打开 tab 列表 + 活动 tab（solution.list 的结果形态）。 */
export interface SolutionSurfaceState {
  readonly tabs: readonly SolutionSurfaceTab[];
  readonly activeTabId: string | null;
}

/** 工位面状态守卫。 */
export function isSolutionSurfaceState(value: unknown): value is SolutionSurfaceState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.tabs)) return false;
  if (!candidate.tabs.every((tab) => isSolutionSurfaceTab(tab))) return false;
  if (candidate.activeTabId !== null && typeof candidate.activeTabId !== "string") return false;
  return true;
}
