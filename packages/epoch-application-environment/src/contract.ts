/**
 * epoch-application-environment 公共契约聚合入口（再导出）。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md 与
 * ARCHITECTURE-LOCK 不变量 16（provider-neutral core）：本包不引入任何
 * provider / 渲染器 / surface UI 实现类型；只导出契约 + 守卫 + 注册表
 * 工厂。具体类型分散在 capability.ts / descriptor.ts / status.ts /
 * privacy.ts / session.ts / provider.ts / registry.ts / identity.ts，
 * 以遵守 architecture-policy.yaml 的 maxContractLines 上限。
 */
// 能力平面 + 自治模式 + adapter seam。
export type {
  CapabilityPlane,
  AutonomyMode,
  AdapterSeam,
  PlaneCapabilityDeclaration,
} from "./capability.ts";
export {
  CAPABILITY_PLANES,
  CAPABILITY_PLANE_SET,
  isCapabilityPlane,
  AUTONOMY_MODES,
  AUTONOMY_MODE_SET,
  isAutonomyMode,
  AUTONOMY_MODE_RANK,
  modeAllowsPlane,
  ADAPTER_SEAMS,
  ADAPTER_SEAM_SET,
  isAdapterSeam,
  isPlaneCapabilityDeclaration,
} from "./capability.ts";

// 会话/连接状态 + 健康快照。
export type {
  EnvironmentSessionStatus,
  EnvironmentHealth,
  EnvironmentHealthSnapshot,
} from "./status.ts";
export {
  ENVIRONMENT_SESSION_STATUSES,
  ENVIRONMENT_SESSION_STATUS_SET,
  isEnvironmentSessionStatus,
  ENVIRONMENT_HEALTHS,
  ENVIRONMENT_HEALTH_SET,
  isEnvironmentHealth,
  isEnvironmentHealthSnapshot,
} from "./status.ts";

// 敏感数据范围与隐私策略（验收点 5）。
export type { SensitiveDataScope, SensitiveDataPolicy } from "./privacy.ts";
export {
  SENSITIVE_DATA_SCOPES,
  SENSITIVE_DATA_SCOPE_SET,
  isSensitiveDataScope,
  isSensitiveDataPolicy,
  DEFAULT_SENSITIVE_DATA_POLICY,
  shouldExposeWindowToAgent,
  isCredentialField,
} from "./privacy.ts";

// descriptor + attach request + initiator。
export type {
  EnvironmentDescriptor,
  OperationInitiator,
  EnvironmentAttachRequest,
} from "./descriptor.ts";
export {
  isEnvironmentDescriptor,
  OPERATION_INITIATORS,
  OPERATION_INITIATOR_SET,
  isOperationInitiator,
  isEnvironmentAttachRequest,
} from "./descriptor.ts";

// 会话契约 + 操作 + 预检（验收点 4：observe 不隐式授予 control）。
export type {
  EnvironmentOperationRequest,
  EnvironmentOperationResult,
  EnvironmentSession,
} from "./session.ts";
export { precheckOperation, isSessionActive } from "./session.ts";

// provider 契约。
export type { EnvironmentProvider } from "./provider.ts";
export { isEnvironmentProvider } from "./provider.ts";

// 注册表 + 兼容性校验。
export type { EnvironmentRegistry } from "./registry.ts";
export { createEnvironmentRegistry, isModeCompatibleWithDescriptor } from "./registry.ts";

// 身份键。
export type { EnvironmentSessionIdentity } from "./identity.ts";
export { environmentSessionIdentityKey } from "./identity.ts";
