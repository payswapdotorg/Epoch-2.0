/**
 * epoch-solution-surface 公开契约：Solution Surface 生命周期控制器的 DI 运行时边界
 * 与对外类型面。
 *
 * 依据 spec/architecture/contracts/solution-surface.md「Operations」「Engine neutrality」
 * 「Persistence」：控制器是 Solution Surface 的生命周期权威（open/activate/close/
 * reopen/list），通过依赖注入消费重建引擎注册表与会话工厂——不导入任何引擎实现，
 * 不按 engineId 分支。内存态只保存稳定身份（SolutionSurfaceTab）+ 可移植会话引用
 * （ReconstructionSession），绝不保存渲染器句柄。
 *
 * 依赖注入边界（SolutionSurfaceRuntime）：宿主（W005/W006）注入已组装的引擎注册表
 * 与上下文/solutionId 解析器；控制器不发现引擎、不构造上下文、不解析输入语义。
 */
import type {
  ReconstructionContext,
  ReconstructionEngine,
  ReconstructionEngineRegistry,
  ReconstructionSession,
} from "@zcode/epoch-reconstruction-contract";
import type {
  SolutionActivateRequest,
  SolutionCloseRequest,
  SolutionEngineMetadata,
  SolutionOpenRequest,
  SolutionOpenResult,
  SolutionReopenRequest,
  SolutionSurfaceState,
  SolutionSurfaceTab,
} from "@zcode/epoch-solution-contract";

/**
 * Solution Surface 稳定身份——幂等 open 的判别键。
 *
 * 依据 operations.ts 冻结语义：身份 = workspaceKey + engineId + 解析后的 solutionId。
 * sessionId 由控制器从身份确定性派生（或经 DI 覆盖），不单独参与幂等键。
 */
export interface SolutionSurfaceIdentity {
  readonly workspaceKey: string;
  readonly engineId: string;
  readonly solutionId: string;
}

/**
 * Solution Surface 运行时依赖（依赖注入）。
 *
 * 宿主负责：组装引擎注册表、构造重建上下文（workspaceKey/signal/log 的具体来源）、
 * 以及在 request.solutionId 缺省时从 input 派生稳定 solutionId（宿主知道其引擎的输入语义）。
 * 控制器只透传 workspaceKey、调用 registry.get(engineId)、调用 engine.open。
 */
export interface SolutionSurfaceRuntime {
  /** 引擎注册表：solution-opening 的唯一引擎发现路径；未知 id 由注册表抛错。 */
  readonly registry: ReconstructionEngineRegistry;
  /** 为一次 open 构造重建上下文；缺省时控制器构造仅含 workspaceKey 的最小上下文。 */
  readonly createReconstructionContext?: (workspaceKey: string) => ReconstructionContext;
  /**
   * 可选的 solutionId 解析器。当 SolutionOpenRequest.solutionId 缺省时调用，从 input
   * 派生稳定 id。缺省且 request.solutionId 也缺省时，控制器抛错——幂等 open 必须有稳定身份。
   */
  readonly resolveSolutionId?: (request: SolutionOpenRequest) => string | undefined;
  /** 可选的 sessionId 解析器；缺省时控制器用 `${engineId}:${solutionId}` 派生。 */
  readonly resolveSessionId?: (identity: SolutionSurfaceIdentity) => string;
  /** 可选的 tab id 工厂；缺省时控制器用确定性前缀派生。 */
  readonly createTabId?: (identity: SolutionSurfaceIdentity) => string;
}

/** 控制器内部持有的会话句柄（可移植引用，非渲染器句柄）。 */
export interface SolutionSurfaceSessionHandle {
  readonly tabId: string;
  readonly session: ReconstructionSession;
  readonly engine: ReconstructionEngine;
}

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
  SolutionSurfaceState,
  SolutionSurfaceTab,
};
