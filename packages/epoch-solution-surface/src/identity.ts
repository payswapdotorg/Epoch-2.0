/**
 * epoch-solution-surface 身份键。
 *
 * 幂等 open 的判别键：workspaceKey + engineId + solutionId（operations.ts 冻结语义）。
 * 用 encodeURIComponent 分段、`|` 连接，避免分隔符与字段内容歧义。
 */
import type { SolutionSurfaceIdentity } from "./contract.ts";

/** 身份键：workspaceKey | engineId | solutionId（URL 编码分段）。 */
export function solutionSurfaceIdentityKey(identity: SolutionSurfaceIdentity): string {
  return [identity.workspaceKey, identity.engineId, identity.solutionId]
    .map((part) => encodeURIComponent(part))
    .join("|");
}
