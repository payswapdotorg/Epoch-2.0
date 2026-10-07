/**
 * epoch-world-presentation 公开契约：表现节点/变换/表现引用/交互绑定/
 * 投影模式/可移植状态/编译类型。只允许从 index.ts import。
 */
export type { Quaternion, Transform, Vec3 } from "./math.ts";
export { isQuaternion, isTransform, isVec3 } from "./math.ts";
export type {
  KnownWorldProjectionMode,
  RepresentationKind,
  RepresentationRef,
  WorldProjectionMode,
} from "./representation.ts";
export {
  REPRESENTATION_KINDS,
  REPRESENTATION_KIND_SET,
  WORLD_PROJECTION_MODES,
  isKnownWorldProjectionMode,
  isRepresentationKind,
  isRepresentationRef,
  isWorldProjectionMode,
} from "./representation.ts";
export type {
  InteractionBinding,
  PresentationNodeVisibility,
  WorldPresentationNode,
} from "./presentation-node.ts";
export {
  PRESENTATION_NODE_VISIBILITIES,
  isInteractionBinding,
  isPresentationNodeVisibility,
  isWorldPresentationNode,
} from "./presentation-node.ts";
export type { PortableRendererState } from "./portable-state.ts";
export { isPortableRendererState } from "./portable-state.ts";
export type {
  PresentationCompileOptions,
  PresentationCompiler,
  WorldPresentation,
} from "./compilation.ts";
export { isWorldPresentation } from "./compilation.ts";
