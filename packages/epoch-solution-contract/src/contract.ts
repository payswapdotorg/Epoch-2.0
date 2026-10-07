/**
 * epoch-solution-contract 公开契约：Solution Surface 身份/操作（幂等语义
 * 见 operations.ts）、类型化交互意图（闭合联合）、引擎元数据面。
 * 只允许从 index.ts import。
 */
export type { SolutionSurfaceState, SolutionSurfaceTab } from "./tab.ts";
export {
  SOLUTION_SURFACE_TAB_TYPE,
  isSolutionSurfaceState,
  isSolutionSurfaceTab,
} from "./tab.ts";
export type {
  SolutionActivateRequest,
  SolutionCloseRequest,
  SolutionOpenRequest,
  SolutionOpenResult,
  SolutionReopenRequest,
  SolutionSurfaceOperation,
  SolutionSurfaceOperationKind,
} from "./operations.ts";
export {
  SOLUTION_SURFACE_OPERATION_KINDS,
  isSolutionOpenRequest,
  isSolutionOpenResult,
  isSolutionSurfaceOperation,
  isSolutionTabRequest,
} from "./operations.ts";
export type { SolutionEngineMetadata } from "./engine-metadata.ts";
export { isSolutionEngineMetadata } from "./engine-metadata.ts";
export type {
  SolutionAnnotateIntent,
  SolutionFocusIntent,
  SolutionInteractionIntent,
  SolutionInteractionIntentKind,
  SolutionMeasureIntent,
  SolutionMeasurementPoint,
  SolutionNavigateIntent,
  SolutionSelectIntent,
  SolutionSelectionMode,
  SolutionSetLayerVisibilityIntent,
} from "./intents.ts";
export {
  SOLUTION_INTERACTION_INTENT_KINDS,
  SOLUTION_SELECTION_MODES,
  isSolutionInteractionIntent,
} from "./intents.ts";
