/**
 * epoch-application-environment 环境 descriptor。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md「environment
 * descriptors, registry and session lifecycle」「screen/UI/native adapter seams
 * with truthful capability levels」与验收点 2：provider 通过 descriptor 注册
 * 而非新增 workbench surface 类型。
 *
 * descriptor 是 provider 中立的「能力声明卡」——它声明 id/name/version/runtime
 * （local/remote）、capability planes 与支持的最高 autonomy mode、adapter
 * seams、敏感数据需求。surface 在 attach 时只接受 descriptor；不按 providerId
 * 分支；不为新 provider 引入新 surface 类型（验收点 2）。
 */
import type { AdapterSeam, AutonomyMode, PlaneCapabilityDeclaration } from "./capability.ts";
import { isAdapterSeam, isAutonomyMode, isPlaneCapabilityDeclaration } from "./capability.ts";
import type { SensitiveDataScope } from "./privacy.ts";
import { isSensitiveDataScope } from "./privacy.ts";

/**
 * EnvironmentDescriptor：provider 注册到 EnvironmentRegistry 的能力声明卡。
 *
 * - id：稳定 provider 标识（package/name 形式；surface 不按 id 分支，但用 id
 *   做注册唯一性校验与日志）。
 * - name / version：展示名与版本（用于 UI 展示与日志）。
 * - runtime：local / remote。remote 表示会话经远端 host 中转（验收点 7
 *   远端 host 测试）。
 * - planes：每个 plane 的能力声明（observe/control/semantic 严格分离；
 *   验收点 4）。
 * - maxAutonomyMode：该 provider 声明的最高自治等级。surface 在 attach 时
 *   选 mode ≤ maxAutonomyMode。
 * - adapterSeams：screen/ui/native（truthful capability levels）。
 * - simulation：true 表示 provider 是安全模拟（用于演示与未授权场景；
 *   验收点 1 必须显式标记 simulation）。
 * - sensitiveDataNeeds：provider 声明的最严敏感数据需求；surface 可以更严
 *   但不能更松（验收点 5）。
 */
export interface EnvironmentDescriptor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly runtime: "local" | "remote";
  readonly planes: readonly PlaneCapabilityDeclaration[];
  readonly maxAutonomyMode: AutonomyMode;
  readonly adapterSeams: readonly AdapterSeam[];
  readonly simulation: boolean;
  readonly sensitiveDataNeeds: SensitiveDataScope;
}

export function isEnvironmentDescriptor(value: unknown): value is EnvironmentDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (typeof candidate.version !== "string" || candidate.version.length === 0) return false;
  if (candidate.runtime !== "local" && candidate.runtime !== "remote") return false;
  if (!Array.isArray(candidate.planes)) return false;
  if (!candidate.planes.every((p) => isPlaneCapabilityDeclaration(p))) return false;
  // plane 必须唯一（不能在 observe plane 上重复声明两次）。
  const planeSet = new Set(candidate.planes.map((p) => (p as PlaneCapabilityDeclaration).plane));
  if (planeSet.size !== candidate.planes.length) return false;
  if (!isAutonomyMode(candidate.maxAutonomyMode)) return false;
  if (!Array.isArray(candidate.adapterSeams)) return false;
  if (!candidate.adapterSeams.every((s) => isAdapterSeam(s))) return false;
  if (typeof candidate.simulation !== "boolean") return false;
  if (!isSensitiveDataScope(candidate.sensitiveDataNeeds)) return false;
  return true;
}

/**
 * Initiator：区分人类与 agent 发起的操作（验收点 3）。
 *
 * - human：由人类发起（不受 autonomy mode 限制；可绕过 observe-only 调用 control）。
 * - agent：由 agent 发起；受 mode + capability 双重门控。
 */
export type OperationInitiator = "human" | "agent";

export const OPERATION_INITIATORS: readonly OperationInitiator[] = ["human", "agent"];
export const OPERATION_INITIATOR_SET: ReadonlySet<OperationInitiator> = new Set(
  OPERATION_INITIATORS,
);

export function isOperationInitiator(value: unknown): value is OperationInitiator {
  return typeof value === "string" && OPERATION_INITIATOR_SET.has(value as OperationInitiator);
}

/**
 * AttachRequest：一次 attach 请求（人类或 agent 发起）。
 *
 * - workspaceKey：隔离 key（与 Browser/Terminal 同级语义；来自 surface 宿主）。
 * - providerId：要 attach 的 provider descriptor id；surface 经 registry.get() 解析。
 * - mode：请求的自治模式；surface 检查 mode ≤ descriptor.maxAutonomyMode。
 * - initiator：human / agent（验收点 3）。
 * - sensitiveDataPolicy：surface/host 提供的敏感数据策略；不放宽于 descriptor
 *   的 sensitiveDataNeeds（验收点 5）。
 * - ownerTaskId：归属 task（用于 human/agent 共享 task/session context；验收点 3）。
 * - remoteHost：runtime=remote 时声明目标远端 host（验收点 7）。
 */
export interface EnvironmentAttachRequest {
  readonly workspaceKey: string;
  readonly providerId: string;
  readonly mode: AutonomyMode;
  readonly initiator: OperationInitiator;
  readonly sensitiveDataPolicy?: import("./privacy.ts").SensitiveDataPolicy;
  readonly ownerTaskId?: string | null;
  readonly remoteHost?: { readonly id: string; readonly label: string } | null;
}

export function isEnvironmentAttachRequest(value: unknown): value is EnvironmentAttachRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.workspaceKey !== "string" || candidate.workspaceKey.length === 0)
    return false;
  if (typeof candidate.providerId !== "string" || candidate.providerId.length === 0) return false;
  if (!isAutonomyMode(candidate.mode)) return false;
  if (!isOperationInitiator(candidate.initiator)) return false;
  if (candidate.ownerTaskId !== null && candidate.ownerTaskId !== undefined) {
    if (typeof candidate.ownerTaskId !== "string") return false;
  }
  if (candidate.remoteHost !== null && candidate.remoteHost !== undefined) {
    if (typeof candidate.remoteHost !== "object") return false;
    const host = candidate.remoteHost as Record<string, unknown>;
    if (typeof host.id !== "string" || typeof host.label !== "string") return false;
  }
  return true;
}
