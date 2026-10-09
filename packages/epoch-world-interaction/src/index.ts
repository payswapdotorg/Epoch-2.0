/**
 * @zcode/epoch-world-interaction 公共入口。
 *
 * W007 交互层：plan/section path 计算 + measurement/annotation semantics
 * （world-anchored, stable under renderer switch, stored as projection state —
 * invariant #13/#14：UI 是投影，不成为第二个 BOQ/约束/世界权威）。
 *
 * 只允许从这里 import；跨模块不得深引用内部文件。
 * 不导入任何引擎/渲染器实现类型；只消费冻结契约公开导出。
 */
export type {
  AnnotationKind,
  AnnotationRegistry,
  MeasurementKind,
  MeasurementRegistry,
  PlanViewNavigationPath,
  SectionCutPath,
  WorldAnnotation,
  WorldInteractionLayer,
  WorldMeasurement,
} from "./contract.ts";
export { ANNOTATION_KINDS, MEASUREMENT_KINDS } from "./contract.ts";
export { createMeasurementRegistry } from "./measurement.ts";
export { createAnnotationRegistry } from "./annotation.ts";
export {
  computePlanViewPath,
  computeSectionCutPath,
  planViewPathToNavigationInputs,
  sectionCutPathToVisibilityInputs,
  DEFAULT_SECTION_HIDDEN_LAYERS,
} from "./navigation-path.ts";
export { createWorldInteraction, type CreateWorldInteractionOptions } from "./layer.ts";
export { epochWorldInteractionModule } from "./module.ts";
// 冻结契约再导出（让宿主单入口消费）。
export type { Vec3 } from "@zcode/epoch-world-presentation";
export type { SolutionMeasurementPoint } from "@zcode/epoch-solution-contract";
