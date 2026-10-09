/**
 * web-epoch 公开契约：Web 端 Solution 宿主组合根的对外类型面。
 *
 * - 只允许从 index.ts import；跨模块不得深引用内部文件。
 * - 宿主组合根消费 W003 SolutionSurfaceController（生命周期权威）+ W002 fixture
 *   引擎 + W004 Babylon 渲染器；本契约只冻结宿主对外形态，不冻结引擎/渲染器
 *   实现类型（ARCHITECTURE-LOCK #2/#8：不新增 surface 类型，不按 engineId 分支）。
 * - 选择解析链（interaction.md）：pointer -> renderer.hitTest -> RendererHit
 *   -> entityId -> 语义权威；UI 不得从 mesh 名推断身份。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type { RendererSession } from "@zcode/epoch-renderer-contract";
import type { SolutionSurfaceTab } from "@zcode/epoch-solution-contract";
import type { ReconstructionEngineRegistry } from "@zcode/epoch-reconstruction-contract";
import type { SolutionSurfaceController } from "@zcode/epoch-solution-surface";

/** 参考解打开结果：稳定身份 tab + 世界修订 + 渲染器中立表现 + 渲染器会话。 */
export interface SolutionHostOpenResult {
  readonly tab: SolutionSurfaceTab;
  readonly revision: WorldRevision;
  readonly presentation: WorldPresentation;
  readonly rendererSession: RendererSession;
  readonly created: boolean;
}

/** 可移植渲染器状态（跨画布/渲染器切换存活；worldId 不符即拒绝）。 */
export interface SolutionPortableState {
  readonly worldId: string;
  readonly digest: string;
  readonly hiddenLayerIds?: readonly string[];
  readonly focusedEntityId?: string;
}

/** 宿主组合根：注册引擎/渲染器并提供零配置打开参考解的入口。 */
export interface SolutionHostCompositionRoot {
  readonly registry: ReconstructionEngineRegistry;
  readonly controller: SolutionSurfaceController;
  /**
   * 零用户配置打开参考构造 fixture 解（baseline 变体）。
   * 画布由调用方提供（渲染器在画布上挂载 WebGL 引擎）。幂等：同身份重复 open
   * 复用既有 tab/重建会话，但渲染器会话按画布重建（先释放旧会话）。
   */
  openReferenceSolution(
    canvas: HTMLCanvasElement,
    devicePixelRatio: number,
    portable?: SolutionPortableState,
  ): Promise<SolutionHostOpenResult>;
  /** 释放组合根持有的渲染器会话与重建会话（幂等）。 */
  dispose(): Promise<void>;
}

/** 宿主选择状态：语义 entityId + 展示层 presentationId（来自渲染器命中映射）。 */
export interface SolutionSelectionState {
  readonly entityId: string | null;
  readonly presentationId: string | null;
}

/** fixture 六层可见性状态（SITE/FOUNDATION/STRUCTURE/ENVELOPE/MEP/FINISHES）。 */
export type LayerVisibilityMap = Readonly<Record<string, boolean>>;

export type {
  ReconstructionEngineRegistry,
  RendererSession,
  SolutionSurfaceController,
  SolutionSurfaceTab,
  WorldPresentation,
  WorldRevision,
};
