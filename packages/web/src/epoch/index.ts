/**
 * @zcode/web-epoch 公共入口（W005 — Web Solution Host 组合根与表现编译器）。
 *
 * 只允许从这里 import；跨模块不得深引用内部文件。组合根注册构造 fixture
 * 引擎与 Babylon 渲染器，零用户配置打开参考解。渲染器中立表现由
 * compileFixturePresentation 从 fixture 修订编译，不携带引擎/Babylon 类型。
 */
export { webEpochModule } from "./module.js";
export type {
  LayerVisibilityMap,
  SolutionHostCompositionRoot,
  SolutionHostOpenResult,
  SolutionPortableState,
  SolutionSelectionState,
} from "./contract.js";
export type {
  ReconstructionEngineRegistry,
  RendererSession,
  SolutionSurfaceController,
  SolutionSurfaceTab,
  WorldPresentation,
  WorldRevision,
} from "./contract.js";
export { createSolutionHostCompositionRoot } from "./compositionRoot.js";
export {
  compileFixturePresentation,
  fixtureLayerDescriptions,
  fixtureLayerIds,
} from "./fixturePresentation.js";
