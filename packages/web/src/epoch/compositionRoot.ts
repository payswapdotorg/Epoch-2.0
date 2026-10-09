/**
 * Web 端 Solution 宿主组合根。
 *
 * 依据 spec/work-orders/W005「Default solution wiring」：注册构造 fixture 引擎
 * 与 Babylon 渲染器，使参考解以零用户配置打开。fixture 引擎确定性、零网络、
 * 进程内——纯客户端运行，无服务端改动。
 *
 * 组合根消费 W003 SolutionSurfaceController（生命周期权威）+ W002 fixture 引擎
 * （createConstructionFixtureEngine）+ W004 Babylon 渲染器（createBabylonRenderer）。
 * 不按 engineId 分支，不引入新 surface 类型（ARCHITECTURE-LOCK #2/#8）。
 *
 * 打开流程（solution-surface.md「Operations」六步由控制器编排）：
 * 1. registry.get(engineId) 解析 fixture 引擎（控制器内部）；
 * 2. controller.open 解析 solutionId + 创建重建会话 + 获取世界修订 + 创建 tab；
 * 3. compileFixturePresentation 把修订编译为渲染器中立表现；
 * 4. createBabylonRenderer().mount 表现到画布 -> RendererSession。
 */
import {
  CONSTRUCTION_FIXTURE_ENGINE_ID,
  createConstructionFixtureEngine,
} from "@zcode/epoch-construction-fixture";
import { createReconstructionEngineRegistry } from "@zcode/epoch-reconstruction-contract";
import type { ReconstructionEngineRegistry } from "@zcode/epoch-reconstruction-contract";
import { SolutionSurfaceController } from "@zcode/epoch-solution-surface";
import type { SolutionSurfaceController as ISolutionSurfaceController } from "@zcode/epoch-solution-surface";
import type { SolutionSurfaceTab } from "@zcode/epoch-solution-contract";
import { createBabylonRenderer } from "@zcode/epoch-renderer-babylon";
import type { InteractiveRenderer, RendererSession } from "@zcode/epoch-renderer-babylon";
import type { RendererMountOptions } from "@zcode/epoch-renderer-contract";
import type { PortableRendererState } from "@zcode/epoch-world-presentation";
import type { WorldRevision } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type {
  SolutionHostCompositionRoot,
  SolutionHostOpenResult,
  SolutionPortableState,
} from "./contract.js";
import { compileFixturePresentation } from "./fixturePresentation.js";

const REFERENCE_WORKSPACE_KEY = "epoch-web-host";
const REFERENCE_SOLUTION_ID = "epoch-fixture-pump-house-v1:baseline";
const REFERENCE_TITLE = "Epoch Reference Solution";

/** 按可移植状态构造 PortableRendererState；worldId 不符或无输入返回 null。 */
function buildPortableState(
  portable: SolutionPortableState | undefined,
  presentation: WorldPresentation,
): PortableRendererState | null {
  if (!portable || portable.worldId !== presentation.worldId) return null;
  const state: PortableRendererState = {
    worldId: portable.worldId,
    digest: portable.digest,
  };
  const withLayers =
    portable.hiddenLayerIds && portable.hiddenLayerIds.length > 0
      ? { ...state, hiddenLayerIds: [...portable.hiddenLayerIds] }
      : state;
  return portable.focusedEntityId
    ? { ...withLayers, focusedEntityId: portable.focusedEntityId }
    : withLayers;
}

/** 构造并返回一个 Web 端 Solution 宿主组合根（单例由调用方持有）。 */
export function createSolutionHostCompositionRoot(): SolutionHostCompositionRoot {
  const registry: ReconstructionEngineRegistry = createReconstructionEngineRegistry();
  registry.register(createConstructionFixtureEngine());
  const controller: ISolutionSurfaceController = new SolutionSurfaceController({ registry });
  const renderer: InteractiveRenderer = createBabylonRenderer();
  let current: SolutionHostOpenResult | null = null;

  async function openReferenceSolution(
    canvas: HTMLCanvasElement,
    devicePixelRatio: number,
    portable?: SolutionPortableState,
  ): Promise<SolutionHostOpenResult> {
    // 控制器幂等：同身份重复 open 复用既有 tab/重建会话。但渲染器会话每次重建
    // 需先释放旧会话，避免画布切换后残留旧 runRenderLoop 与 GPU 资源。
    if (current) {
      await current.rendererSession.dispose();
    }
    const result = await controller.open({
      workspaceKey: REFERENCE_WORKSPACE_KEY,
      engineId: CONSTRUCTION_FIXTURE_ENGINE_ID,
      input: {
        kind: "engine-native",
        engineId: CONSTRUCTION_FIXTURE_ENGINE_ID,
        payload: { variant: "baseline" },
      },
      solutionId: REFERENCE_SOLUTION_ID,
      title: REFERENCE_TITLE,
    });
    const revision: WorldRevision = result.revision;
    const presentation: WorldPresentation = compileFixturePresentation(revision, {
      projectionMode: "3d",
    });
    const portableState = buildPortableState(portable, presentation);
    const mountOptions: RendererMountOptions = portableState
      ? { container: canvas, devicePixelRatio, portableState }
      : { container: canvas, devicePixelRatio };
    const rendererSession: RendererSession = await renderer.mount(presentation, mountOptions);
    const tab: SolutionSurfaceTab = result.tab;
    current = {
      tab,
      revision,
      presentation,
      rendererSession,
      created: result.created,
    };
    return current;
  }

  async function dispose(): Promise<void> {
    if (current) {
      await current.rendererSession.dispose();
      current = null;
    }
  }

  return { registry, controller, openReferenceSolution, dispose };
}

export { createBabylonRenderer, compileFixturePresentation };
export type { InteractiveRenderer, RendererSession };
