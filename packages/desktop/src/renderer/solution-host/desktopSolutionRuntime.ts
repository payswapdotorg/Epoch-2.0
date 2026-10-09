/**
 * Desktop Solution Host — composition root for the default solution.
 *
 * W006 边界法（invariant 15 workstation parity / invariant 2 solution is a surface）：
 * 在 renderer 进程内组装冻结的 W001–W004 能力——重建引擎注册表（含 construction-fixture 引擎）、
 * Babylon 渲染器适配器、Solution Surface 生命周期控制器——并以零用户配置打开参考构造解。
 * fixture 引擎是确定性、零网络、in-process（descriptor.runtime === "in-process"），
 * 故整套运行时驻留 renderer 进程；平台特定代码不进入本文件（host/main/preload 各自只做自己的事）。
 *
 * 引擎中立（invariant 8 / solution-surface 契约「Engine neutrality」）：只通过
 * runtime.registry.get(engineId) 解析引擎，不按 engineId 分支。换引擎只需注册新引擎 + 新 open 请求。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type { InteractiveRenderer } from "@zcode/epoch-renderer-contract";
import type {
  ReconstructionEngineRegistry,
  ReconstructionContext,
} from "@zcode/epoch-reconstruction-contract";
import type { SolutionSurfaceTab } from "@zcode/epoch-solution-surface";
import type { ConstructionFixtureEntity } from "@zcode/epoch-construction-fixture";
import { createReconstructionEngineRegistry } from "@zcode/epoch-reconstruction-contract";
import { SolutionSurfaceController } from "@zcode/epoch-solution-surface";
import { createBabylonRenderer } from "@zcode/epoch-renderer-babylon";
import {
  CONSTRUCTION_FIXTURE_ENGINE_ID,
  CONSTRUCTION_LAYERS,
  createConstructionFixtureEngine,
} from "@zcode/epoch-construction-fixture";
import { compileFixturePresentation } from "./fixturePresentationCompiler.js";

/** 默认工作区身份（desktop 无外部 workspace 时使用；身份 key 稳定即可）。 */
export const DESKTOP_DEFAULT_WORKSPACE_KEY = "epoch-desktop:default-workspace";

/** 参考 solutionId（确定性字面量；与 fixture baseline 变体一一对应）。 */
export const DESKTOP_DEFAULT_SOLUTION_ID = "construction-fixture:baseline";

/** 桌面宿主解析出的 Solution 运行时句柄（不含渲染器句柄——RendererSession 由视图层 mount 持有）。 */
export interface DesktopSolutionRuntime {
  /** Solution Surface 稳定身份 tab（engineId/sessionId/solutionId/title）。 */
  readonly tab: SolutionSurfaceTab;
  /** 引擎产出的世界修订（语义权威快照；用于 inspector 投影）。 */
  readonly revision: WorldRevision;
  /** 投影后的渲染器中立表现（喂给 Babylon 适配器 mount）。 */
  readonly presentation: WorldPresentation;
  /** Babylon 交互式渲染器适配器（未挂载；视图层提供 canvas 后调用 mount）。 */
  readonly renderer: InteractiveRenderer;
  /** Solution Surface 生命周期控制器（保留以便 activate/close/reopen）。 */
  readonly controller: SolutionSurfaceController;
  /** entityId -> 构造 fixture 实体（含 layer/geometry 扩展字段，供 inspector 显示语义）。 */
  readonly entityById: ReadonlyMap<string, ConstructionFixtureEntity>;
  /** fixture 六层语义图层 id（供图层控件渲染与 setVisibility）。 */
  readonly layerIds: readonly string[];
  /** 引擎人类可读名（HUD 展示）。 */
  readonly engineName: string;
}

/**
 * 组装默认 Solution 运行时并打开参考构造解。
 *
 * 零用户配置：注册 construction-fixture 引擎 + 创建 Babylon 渲染器 + 通过控制器幂等 open。
 * 相同 workspaceKey+engineId+solutionId 重复调用复用既有 tab（created=false），不复制会话。
 */
export async function createDesktopSolutionRuntime(options?: {
  readonly workspaceKey?: string;
  readonly variant?: "baseline" | "alternate-pitched-roof";
}): Promise<DesktopSolutionRuntime> {
  const workspaceKey = options?.workspaceKey ?? DESKTOP_DEFAULT_WORKSPACE_KEY;
  const variant = options?.variant ?? "baseline";

  // 1. 引擎注册表（唯一引擎发现路径；未知 id 由注册表抛错——UI 不得静默降级）。
  const registry: ReconstructionEngineRegistry = createReconstructionEngineRegistry();
  registry.register(createConstructionFixtureEngine());

  // 2. Babylon 渲染器适配器（descriptor 声明 web+desktop 能力；mount 由视图层驱动）。
  const renderer = createBabylonRenderer();

  // 3. Solution Surface 控制器（生命周期权威；依赖注入消费注册表，不发现引擎、不构造上下文）。
  const createReconstructionContext = (key: string): ReconstructionContext => ({
    workspaceKey: key,
  });
  const controller = new SolutionSurfaceController({
    registry,
    createReconstructionContext,
  });

  // 4. 幂等 open（六步由控制器编排：解析引擎 -> 解析/创建会话 -> 获取世界修订 -> 创建/复用 tab -> 挂载 -> 激活）。
  const result = await controller.open({
    workspaceKey,
    engineId: CONSTRUCTION_FIXTURE_ENGINE_ID,
    input: {
      kind: "engine-native",
      engineId: CONSTRUCTION_FIXTURE_ENGINE_ID,
      payload: { variant },
    },
    solutionId:
      variant === "baseline" ? DESKTOP_DEFAULT_SOLUTION_ID : `construction-fixture:${variant}`,
    title: `Construction Fixture · ${variant}`,
  });

  // 5. 把世界修订投影为渲染器中立表现（宿主侧编译器 shim；W007 将提供规范 PresentationCompiler）。
  const revision: WorldRevision = result.revision;
  const presentation = compileFixturePresentation(revision);

  // 6. 实体索引（inspector 按 entityId 取语义；layer/geometry 为 fixture 扩展字段）。
  const entityById = new Map<string, ConstructionFixtureEntity>();
  for (const entity of revision.entities) {
    entityById.set(entity.entityId, entity as ConstructionFixtureEntity);
  }

  return {
    tab: result.tab,
    revision,
    presentation,
    renderer,
    controller,
    entityById,
    layerIds: [...CONSTRUCTION_LAYERS],
    engineName: result.engine.name,
  };
}
