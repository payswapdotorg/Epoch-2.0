/**
 * epoch-renderer-three 适配器公共类型面（contract.ts）。
 *
 * 依据 spec/architecture/contracts/renderer.md「Adapter interface」与
 * W008 边界法：公共签名不得出现任何 Three.js 类型——本文件只包含字符串
 * 联合、数字与布尔；Three 类型全部封在包内部实现文件里。公开入口
 * （index.ts）只再导出冻结契约类型 + 本文件定义的工厂选项 + 工厂函数。
 *
 * 与 W004（Babylon）的 contract.ts 对称：选项集合一致（引擎模式 +
 * 无头视口），语义镜像——任何宿主可互换两个渲染器而不改选项构造。
 */

/**
 * 引擎模式。
 *
 * - "auto"：默认。mount 时把 container 解释为 HTMLCanvasElement 并创建
 *   WebGL 渲染器（THREE.WebGLRenderer）。
 * - "webgl"：显式 WebGL 渲染器（与 "auto" 相同路径，语义上更明确）。
 * - "null"：无头模式——不创建 WebGL 上下文；构建真实 Three.js 场景图
 *   与相机，CPU 射线-网格拾取（THREE.Raycaster）真实执行，仅不产生 GPU 帧。
 *   供无头一致性测试与无显示环境使用。
 *
 * "webgpu" 未在 W008 实现：描述符 capabilities.webgpu 缺省（不声明）。
 */
export type ThreeRendererEngineMode = "auto" | "webgl" | "null";

/** 无头（"null" 模式）引擎的虚拟视口尺寸（CSS 像素语义；缺省 800x600）。 */
export interface ThreeHeadlessViewport {
  readonly width: number;
  readonly height: number;
}

/** 适配器工厂选项（全部可缺省；不含 Three 类型）。 */
export interface ThreeRendererOptions {
  readonly engineMode?: ThreeRendererEngineMode;
  readonly headlessViewport?: ThreeHeadlessViewport;
}

const ENGINE_MODES = ["auto", "webgl", "null"] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 引擎模式守卫。 */
export function isThreeRendererEngineMode(value: unknown): value is ThreeRendererEngineMode {
  return typeof value === "string" && (ENGINE_MODES as readonly string[]).includes(value);
}

/** 无头视口守卫。 */
export function isThreeHeadlessViewport(value: unknown): value is ThreeHeadlessViewport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.width) && isFiniteNumber(candidate.height);
}

/** 工厂选项守卫。 */
export function isThreeRendererOptions(value: unknown): value is ThreeRendererOptions {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.engineMode !== undefined && !isThreeRendererEngineMode(candidate.engineMode)) {
    return false;
  }
  if (
    candidate.headlessViewport !== undefined &&
    !isThreeHeadlessViewport(candidate.headlessViewport)
  ) {
    return false;
  }
  return true;
}
