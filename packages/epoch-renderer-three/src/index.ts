/**
 * @zcode/epoch-renderer-three 公共入口。
 *
 * W008 边界法：本入口只再导出冻结契约类型（含守卫）+ 适配器工厂与其
 * renderer-neutral 选项类型 + 模块清单。three 的任何类型、值或类都不出现
 * 在这里——Three.js 只存在于包内部实现文件（adapter/scene/camera/session/
 * fabric）。
 */
export { createThreeRenderer } from "./adapter.ts";
export type {
  ThreeHeadlessViewport,
  ThreeRendererEngineMode,
  ThreeRendererOptions,
} from "./contract.ts";
export {
  isThreeHeadlessViewport,
  isThreeRendererEngineMode,
  isThreeRendererOptions,
} from "./contract.ts";
export { createThreeRendererDescriptor } from "./descriptor.ts";
export { THREE_RENDERER_VERSION } from "./descriptor.ts";
export { threeRendererModule } from "./module.ts";

export type { RendererCapabilities, RendererDescriptor } from "@zcode/epoch-renderer-contract";
export { isRendererCapabilities, isRendererDescriptor } from "@zcode/epoch-renderer-contract";
export type {
  FocusInput,
  HitTestInput,
  InteractiveRenderer,
  NavigationInput,
  RendererHit,
  RendererMountOptions,
  RendererSession,
  VisibilityInput,
} from "@zcode/epoch-renderer-contract";
export {
  isFocusInput,
  isHitTestInput,
  isInteractiveRenderer,
  isNavigationInput,
  isRendererHit,
  isRendererMountOptions,
  isRendererSession,
  isWellFormedRenderer,
} from "@zcode/epoch-renderer-contract";
export type {
  PortableRendererState,
  Quaternion,
  RepresentationRef,
  Transform,
  Vec3,
  WorldPresentation,
  WorldPresentationNode,
} from "@zcode/epoch-world-presentation";
export {
  isPortableRendererState,
  isVec3,
  isWorldPresentation,
} from "@zcode/epoch-world-presentation";
