/**
 * @zcode/epoch-solution-surface 公共入口。
 *
 * Solution Surface 生命周期控制器（W003）：消费冻结的 W001 契约
 * （solution-contract + reconstruction-contract），通过依赖注入实现引擎中立的
 * open/activate/close/reopen/list。零运行时依赖；不含任何引擎实现类型。
 */
export type {
  ReconstructionContext,
  ReconstructionEngine,
  ReconstructionEngineRegistry,
  ReconstructionSession,
  SolutionActivateRequest,
  SolutionCloseRequest,
  SolutionEngineMetadata,
  SolutionOpenRequest,
  SolutionOpenResult,
  SolutionReopenRequest,
  SolutionSurfaceIdentity,
  SolutionSurfaceRuntime,
  SolutionSurfaceSessionHandle,
  SolutionSurfaceState,
  SolutionSurfaceTab,
} from "./contract.ts";
export { SolutionSurfaceController } from "./controller.ts";
export { solutionSurfaceIdentityKey } from "./identity.ts";
export { epochSolutionSurfaceModule } from "./module.ts";
