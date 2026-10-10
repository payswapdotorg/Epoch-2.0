/**
 * @zcode/epoch-environment-surface 公共入口。
 *
 * W028 — Application Environment Surface 生命周期控制器：消费 @zcode/epoch-application-environment
 * 的 provider 中立契约，通过依赖注入实现 provider 中立的
 * open/activate/close/list/call。一个控制器实例对应一个工作区/进程的
 * Application Environment Surface 状态；adapter 句柄不在内存态中。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md 与
 * ARCHITECTURE-LOCK 不变量 16/23/24：provider-neutral core；外部应用是带
 * 分隔能力的共享环境；provider 通过 descriptor 注册而非新增 surface 类型。
 */
export type {
  EnvironmentSurfaceIdentity,
  EnvironmentSurfaceRuntime,
  EnvironmentSurfaceTab,
  EnvironmentSurfaceState,
  EnvironmentSurfaceOpenRequest,
  EnvironmentSurfaceOpenResult,
  EnvironmentSurfaceActivateRequest,
  EnvironmentSurfaceCloseRequest,
  EnvironmentSurfaceOperationCall,
  // 再导出 application-environment 包的常用类型，方便外部单点导入。
  EnvironmentAttachRequest,
  EnvironmentDescriptor,
  EnvironmentHealthSnapshot,
  EnvironmentOperationRequest,
  EnvironmentOperationResult,
  EnvironmentRegistry,
  EnvironmentSession,
  EnvironmentSessionIdentity,
} from "./contract.ts";
export { EnvironmentSurfaceController } from "./controller.ts";
export { environmentSurfaceIdentityKey } from "./identity.ts";
export { epochEnvironmentSurfaceModule } from "./module.ts";
