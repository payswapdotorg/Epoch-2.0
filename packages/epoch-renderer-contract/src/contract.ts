/**
 * epoch-renderer-contract 公开契约：渲染器描述符/适配器/会话/命中/挂载选项/
 * 导航-命中-可见性-聚焦输入。Vec3 的规范定义在 epoch-world-presentation，
 * 这里 re-export 以便渲染器适配器单入口消费。只允许从 index.ts import。
 */
export type { RendererCapabilities, RendererDescriptor } from "./descriptor.ts";
export { isRendererCapabilities, isRendererDescriptor } from "./descriptor.ts";
export type { FocusInput, HitTestInput, NavigationInput, VisibilityInput } from "./input.ts";
export { isFocusInput, isHitTestInput, isNavigationInput, isVisibilityInput } from "./input.ts";
export type {
  InteractiveRenderer,
  RendererHit,
  RendererMountOptions,
  RendererSession,
} from "./session.ts";
export {
  isInteractiveRenderer,
  isRendererHit,
  isRendererMountOptions,
  isRendererSession,
  isWellFormedRenderer,
} from "./session.ts";
export type { Vec3 } from "@zcode/epoch-world-presentation";
export { isVec3 } from "@zcode/epoch-world-presentation";
