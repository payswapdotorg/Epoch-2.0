/**
 * epoch-application-environment 身份键。
 *
 * 幂等 attach 的判别键：workspaceKey + providerId + initiator + ownerTaskId
 * （+ provider-specific session discriminant，缺省 = `${providerId}`）。
 * 用 encodeURIComponent 分段、`|` 连接，避免分隔符与字段内容歧义。
 *
 * 与 Solution Surface 的 solutionSurfaceIdentityKey 同语义——但 Environment
 * 的身份带 initiator 与 ownerTaskId：同一 workspace 同一 provider 在不同
 * initiator 下是不同会话（验收点 3：human 与 agent 共享 task/session context，
 * 但 initiator/permission 必须分离）。
 */
export interface EnvironmentSessionIdentity {
  readonly workspaceKey: string;
  readonly providerId: string;
  readonly initiator: "human" | "agent";
  readonly ownerTaskId: string | null;
}

/** 身份键：workspaceKey | providerId | initiator | ownerTaskId（URL 编码分段）。 */
export function environmentSessionIdentityKey(identity: EnvironmentSessionIdentity): string {
  const ownerPart = identity.ownerTaskId ?? "";
  return [identity.workspaceKey, identity.providerId, identity.initiator, ownerPart]
    .map((part) => encodeURIComponent(part))
    .join("|");
}
