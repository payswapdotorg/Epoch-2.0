/**
 * epoch-application-environment 会话/连接状态。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md「visible
 * attach/detach/observation status」「local/remote boundaries and
 * recovery/health status」与验收点 7：
 *
 * - EnvironmentSessionStatus：attached / detached / lost / stale。状态变化
 *   经 EnvironmentSession.status() 同步暴露给 surface/UI，使 attach/detach/
 *   observation 状态可见。
 * - EnvironmentHealth：health=ok|degraded|unreachable。远端 host 离线、源
 *   gap、权限被拒都映射到 degraded/unreachable，且 mode/capability 不被
 *   静默提升（验收点 7）。
 *
 * 只导出类型 + 常量 + 守卫；零运行时依赖。
 */

/**
 * 会话生命周期状态。lost 表示远端连接丢失（可重连）；stale 表示会话仍在但
 * 与远端事实不同步（缓存陈旧，需要重新 attach）；detached 表示已显式断开。
 */
export type EnvironmentSessionStatus = "attached" | "detached" | "lost" | "stale";

export const ENVIRONMENT_SESSION_STATUSES: readonly EnvironmentSessionStatus[] = [
  "attached",
  "detached",
  "lost",
  "stale",
];
export const ENVIRONMENT_SESSION_STATUS_SET: ReadonlySet<EnvironmentSessionStatus> = new Set(
  ENVIRONMENT_SESSION_STATUSES,
);

export function isEnvironmentSessionStatus(value: unknown): value is EnvironmentSessionStatus {
  return (
    typeof value === "string" &&
    ENVIRONMENT_SESSION_STATUS_SET.has(value as EnvironmentSessionStatus)
  );
}

/**
 * 健康状态：ok / degraded / unreachable。
 *
 * - ok：所有声明的 plane 都 available；mode 与 capability 实际可执行。
 * - degraded：至少一个 plane 不可用（source-gap / unsupported-signal），但会话仍 attached。
 * - unreachable：远端 host 不可达（lost 连接 + 不可恢复）。会话进入 detached/lost。
 */
export type EnvironmentHealth = "ok" | "degraded" | "unreachable";

export const ENVIRONMENT_HEALTHS: readonly EnvironmentHealth[] = ["ok", "degraded", "unreachable"];
export const ENVIRONMENT_HEALTH_SET: ReadonlySet<EnvironmentHealth> = new Set(ENVIRONMENT_HEALTHS);

export function isEnvironmentHealth(value: unknown): value is EnvironmentHealth {
  return typeof value === "string" && ENVIRONMENT_HEALTH_SET.has(value as EnvironmentHealth);
}

/**
 * 会话健康快照：状态 + health + 不可用原因（如有）。
 *
 * `unavailablePlanes`：当前不可用的 plane 列表（degraded 时非空）。
 * `reason`：degraded/unreachable 时的简短原因（lost-connection / denied-permission /
 * source-gap / unsupported-signal / remote-host-down 等）。
 */
export interface EnvironmentHealthSnapshot {
  readonly status: EnvironmentSessionStatus;
  readonly health: EnvironmentHealth;
  readonly unavailablePlanes: readonly import("./capability.ts").CapabilityPlane[];
  readonly reason: string | null;
}

export function isEnvironmentHealthSnapshot(value: unknown): value is EnvironmentHealthSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isEnvironmentSessionStatus(candidate.status)) return false;
  if (!isEnvironmentHealth(candidate.health)) return false;
  if (!Array.isArray(candidate.unavailablePlanes)) return false;
  if (!candidate.unavailablePlanes.every((p) => typeof p === "string")) return false;
  if (candidate.reason !== null && typeof candidate.reason !== "string") return false;
  return true;
}
