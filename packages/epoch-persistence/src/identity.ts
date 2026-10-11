/**
 * epoch-persistence 解身份键 + W003 tab 投影。
 *
 * 身份键与 W003 Solution Surface 的幂等键同构（workspaceKey + engineId +
 * solutionId，URL 编码分段、"|" 连接）——同一语义身份在 surface 控制器与
 * 持久层得到同一键。solutionIdentityFromTab 是纯投影：从 W003 冻结的
 * SolutionSurfaceTab 提取稳定身份三元组，不发明任何数据（openedAt 等
 * 表现态字段被丢弃——持久层只存稳定身份）。
 */
import { isSolutionSurfaceTab } from "@zcode/epoch-solution-contract";
import type { SolutionSurfaceTab } from "@zcode/epoch-solution-contract";
import type { SolutionIdentity } from "./contract.ts";

/** 身份键：workspaceKey | engineId | solutionId（URL 编码分段）。 */
export function solutionIdentityKey(identity: SolutionIdentity): string {
  return [identity.workspaceKey, identity.engineId, identity.solutionId]
    .map((part) => encodeURIComponent(part))
    .join("|");
}

/**
 * 从 W003 Solution Surface tab 投影解身份。tab 未通过冻结守卫时抛
 * TypeError（不静默容忍畸形 tab——宿主应先经过 W003 控制器创建 tab）。
 */
export function solutionIdentityFromTab(tab: SolutionSurfaceTab): SolutionIdentity {
  if (!isSolutionSurfaceTab(tab)) {
    throw new TypeError("solutionIdentityFromTab expects a well-formed SolutionSurfaceTab");
  }
  return {
    workspaceKey: tab.workspaceKey,
    engineId: tab.engineId,
    solutionId: tab.solutionId,
  };
}
