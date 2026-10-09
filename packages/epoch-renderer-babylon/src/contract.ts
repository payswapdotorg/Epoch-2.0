/**
 * epoch-renderer-babylon 适配器公共类型面（contract.ts）。
 *
 * 依据 spec/architecture/contracts/renderer.md「Adapter interface」与
 * W004 边界法：公共签名不得出现任何 Babylon 类型——本文件只包含字符串
 * 联合、数字与布尔；Babylon 类型全部封在包内部实现文件里。公开入口
 * （index.ts）只再导出冻结契约类型 + 本文件定义的工厂选项 + 工厂函数。
 */

/**
 * 引擎模式。
 *
 * - "auto"：默认。mount 时把 container 解释为类 canvas 目标并创建 WebGL
 *   引擎（Babylon `Engine`）。
 * - "webgl"：显式 WebGL 引擎（与 "auto" 相同路径，语义上更明确）。
 * - "null"：Babylon `NullEngine`（CPU-only，无 WebGL/DOM）。供无头一致性
 *   测试与无显示环境使用——真实适配器代码路径（场景构建、CPU 拾取、
 *   相机数学）全部照常执行，仅不产生 GPU 帧。
 *
 * "webgpu" 未在 W004 实现：描述符 capabilities.webgpu 缺省（不声明）。
 */
export type BabylonRendererEngineMode = "auto" | "webgl" | "null";

/** 无头（"null" 模式）引擎的虚拟视口尺寸（CSS 像素语义；缺省 800x600）。 */
export interface BabylonHeadlessViewport {
  readonly width: number;
  readonly height: number;
}

/** 适配器工厂选项（全部可缺省；不含 Babylon 类型）。 */
export interface BabylonRendererOptions {
  readonly engineMode?: BabylonRendererEngineMode;
  readonly headlessViewport?: BabylonHeadlessViewport;
}

const ENGINE_MODES = ["auto", "webgl", "null"] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 引擎模式守卫。 */
export function isBabylonRendererEngineMode(value: unknown): value is BabylonRendererEngineMode {
  return typeof value === "string" && (ENGINE_MODES as readonly string[]).includes(value);
}

/** 无头视口守卫。 */
export function isBabylonHeadlessViewport(value: unknown): value is BabylonHeadlessViewport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.width) && isFiniteNumber(candidate.height);
}

/** 工厂选项守卫。 */
export function isBabylonRendererOptions(value: unknown): value is BabylonRendererOptions {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.engineMode !== undefined && !isBabylonRendererEngineMode(candidate.engineMode)) {
    return false;
  }
  if (
    candidate.headlessViewport !== undefined &&
    !isBabylonHeadlessViewport(candidate.headlessViewport)
  ) {
    return false;
  }
  return true;
}
