/**
 * epoch-renderer-contract 渲染器适配器与会话。
 *
 * 依据 spec/architecture/contracts/renderer.md「Adapter interface」：
 * InteractiveRenderer.mount(presentation, options) -> RendererSession；
 * 会话方法分组可演进，但语义归属不可变（导航/命中/可见性/聚焦/释放）。
 * 渲染器切换流（capture portable state -> mount -> restore -> release）
 * 由宿主编排；切换不得改变语义世界身份。
 */
import type {
  WorldPresentation,
  PortableRendererState,
  Vec3,
} from "@zcode/epoch-world-presentation";
import { isPortableRendererState, isVec3 } from "@zcode/epoch-world-presentation";
import type { RendererDescriptor } from "./descriptor.ts";
import { isRendererDescriptor } from "./descriptor.ts";
import type { NavigationInput, HitTestInput, VisibilityInput, FocusInput } from "./input.ts";

/**
 * 挂载选项。
 *
 * - container：宿主提供的挂载目标，对契约不透明（Web 为 DOM 元素、
 *   桌面为窗口内句柄——由适配器解释，不进入共享契约类型）。
 * - portableState：渲染器切换时应恢复的可移植语义状态。
 * - devicePixelRatio：宿主视口 DPR（如可用）。
 */
export interface RendererMountOptions {
  readonly container: unknown;
  readonly portableState?: PortableRendererState;
  readonly devicePixelRatio?: number;
}

/** 挂载选项守卫：container 不校验（不透明）；可移植状态/DPR 存在时校验。 */
export function isRendererMountOptions(value: unknown): value is RendererMountOptions {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!("container" in candidate)) return false;
  if (candidate.portableState !== undefined && !isPortableRendererState(candidate.portableState)) {
    return false;
  }
  if (
    candidate.devicePixelRatio !== undefined &&
    (typeof candidate.devicePixelRatio !== "number" ||
      !Number.isFinite(candidate.devicePixelRatio) ||
      candidate.devicePixelRatio <= 0)
  ) {
    return false;
  }
  return true;
}

/**
 * 渲染器命中：presentationId 必给；entityId 可选（渲染器无法直接给出
 * 语义 id 时由 Epoch 解析规范实体映射——spec「Renderer hit」）。
 */
export interface RendererHit {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly point?: Vec3;
}

/** 命中守卫。 */
export function isRendererHit(value: unknown): value is RendererHit {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.presentationId !== "string" || candidate.presentationId.length === 0) {
    return false;
  }
  if (candidate.entityId !== undefined && typeof candidate.entityId !== "string") return false;
  if (candidate.point !== undefined && !isVec3(candidate.point)) return false;
  return true;
}

/** 渲染器会话：一次 mount 的存续期；dispose 释放 GPU/运行时资源。 */
export interface RendererSession {
  navigate(input: NavigationInput): void;
  hitTest(input: HitTestInput): Promise<RendererHit | null>;
  setVisibility(input: VisibilityInput): void;
  focus(input: FocusInput): void;
  dispose(): Promise<void>;
}

/** 交互式渲染器适配器契约。 */
export interface InteractiveRenderer {
  descriptor(): RendererDescriptor;
  mount(presentation: WorldPresentation, options: RendererMountOptions): Promise<RendererSession>;
}

/** 渲染器结构守卫。 */
export function isInteractiveRenderer(value: unknown): value is InteractiveRenderer {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.descriptor !== "function") return false;
  if (typeof candidate.mount !== "function") return false;
  return true;
}

/** 复合守卫：结构合法且 descriptor() 返回合法描述符（异常视为不合法）。 */
export function isWellFormedRenderer(value: unknown): value is InteractiveRenderer {
  if (!isInteractiveRenderer(value)) return false;
  try {
    return isRendererDescriptor(value.descriptor());
  } catch {
    return false;
  }
}

/** 会话结构守卫（五个必需方法成员）。 */
export function isRendererSession(value: unknown): value is RendererSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const methods = ["navigate", "hitTest", "setVisibility", "focus", "dispose"];
  return methods.every((method) => typeof candidate[method] === "function");
}
