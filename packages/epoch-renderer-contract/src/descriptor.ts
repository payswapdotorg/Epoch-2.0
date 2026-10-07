/**
 * epoch-renderer-contract 渲染器描述符。
 *
 * 依据 spec/architecture/contracts/renderer.md「Renderer descriptor」。
 * 渲染器是能力（capability）：Babylon/Three/未来渲染器都是可替换适配器，
 * 场景图/对象句柄/缓存/帧状态永远不是语义事实（ARCHITECTURE-LOCK #6）。
 */

/** 渲染器能力声明。webgpu/webgl 为可选探测结果。 */
export interface RendererCapabilities {
  readonly web: boolean;
  readonly desktop: boolean;
  readonly webgpu?: boolean;
  readonly webgl?: boolean;
  readonly hitTesting: boolean;
  readonly plan: boolean;
  readonly section: boolean;
  readonly walk: boolean;
}

/** 渲染器描述符。 */
export interface RendererDescriptor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: RendererCapabilities;
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

/** 能力守卫：必填布尔 + 可选布尔。 */
export function isRendererCapabilities(value: unknown): value is RendererCapabilities {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const required = ["web", "desktop", "hitTesting", "plan", "section", "walk"];
  if (!required.every((key) => typeof candidate[key] === "boolean")) return false;
  if (!isOptionalBoolean(candidate.webgpu)) return false;
  if (!isOptionalBoolean(candidate.webgl)) return false;
  return true;
}

/** 描述符守卫。 */
export function isRendererDescriptor(value: unknown): value is RendererDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (typeof candidate.version !== "string" || candidate.version.length === 0) return false;
  if (!isRendererCapabilities(candidate.capabilities)) return false;
  return true;
}
