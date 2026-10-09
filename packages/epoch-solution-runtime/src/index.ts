/**
 * @zcode/epoch-solution-runtime 公共入口。
 *
 * W007 宿主无关 Solution 运行时组合：把一次 solution session 绑定到 engine +
 * renderer + interaction mapping，并暴露宿主无关的可移植视图状态（focused
 * entity、layer visibility、selection、camera-independent view state —
 * invariant #12）+ 类型化交互意图派发（renderer-neutral，invariant #11/#13）。
 *
 * 不导入任何引擎/渲染器实现类型；只消费冻结契约公开导出。
 */
export type {
  LayerVisibilityState,
  SolutionPortableViewState,
  SolutionRuntime,
  SolutionRuntimeFactoryOptions,
  SolutionRuntimeHandle,
  SolutionRuntimeListener,
  SolutionRuntimeState,
  SolutionSelectionState,
  SolutionRuntimeSnapshot,
} from "./contract.ts";
export type { EntityDownstreamProjection } from "./projections.ts";
export {
  createSolutionRuntime,
  readRuntimeLayerVisibility,
  readRuntimeSelection,
  type SolutionRuntimeImpl,
  type CreateSolutionRuntimeOptions,
} from "./runtime.ts";
export {
  isolateLayer,
  unisolateLayers,
  readEntityQuantity,
  readEntityConstraintRefs,
  projectEntityDownstream,
} from "./projections.ts";
export { epochSolutionRuntimeModule } from "./module.ts";
// 冻结契约再导出（让宿主单入口消费）。
export type {
  InteractiveRenderer,
  RendererHit,
  RendererSession,
} from "@zcode/epoch-renderer-contract";
export type {
  PortableRendererState,
  WorldPresentation,
  WorldProjectionMode,
} from "@zcode/epoch-world-presentation";
export type { WorldRevision, WorldEntity, QuantityValue } from "@zcode/epoch-world-model";
export type { SolutionSurfaceTab, SolutionInteractionIntent } from "@zcode/epoch-solution-contract";
