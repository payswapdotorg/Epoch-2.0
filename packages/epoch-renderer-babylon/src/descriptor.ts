/**
 * epoch-renderer-babylon 渲染器描述符。
 *
 * 依据 spec/architecture/contracts/renderer.md「Renderer descriptor」。
 * 能力声明必须诚实（AGENTS.md：不得声称未行使的能力）：
 *
 * - web/desktop: true —— 同一代码路径（WebGL 引擎）同时服务浏览器与
 *   Electron 桌面宿主；W005/W006 才做真实宿主验证。
 * - webgl: true —— WebGL 引擎路径已实现（Babylon `Engine`）。
 * - webgpu: 缺省 —— W004 未实现 WebGPU 引擎路径，不声明。
 * - hitTesting: true —— CPU 拾取（NullEngine 下亦为真实射线-网格求交）。
 * - plan: true —— 适配器对投影模式不做限制：渲染投影由表现编译器给出
 *   （world-presentation 契约），任何 projectionMode 的表现均可挂载；
 *   俯视导航可用 navigate({kind:"look-at"}) 表达。
 * - section: false —— 剖切表现（representation kind "section-cut"）的
 *   几何解析未实现（fabric 跳过该类），不声明剖切能力。
 * - walk: false —— 无行走模式相机；导航能力为 orbit/pan/zoom。
 */
import type { RendererDescriptor } from "@zcode/epoch-renderer-contract";

/** 适配器语义版本（随工作单推进）。 */
export const BABYLON_RENDERER_VERSION = "0.1.0";

/** 描述符工厂：每次调用返回新的冻结对象，避免跨会话共享可变状态。 */
export function createBabylonRendererDescriptor(): RendererDescriptor {
  return {
    id: "epoch-renderer-babylon",
    name: "Babylon.js Interactive Renderer",
    version: BABYLON_RENDERER_VERSION,
    capabilities: {
      web: true,
      desktop: true,
      webgl: true,
      hitTesting: true,
      plan: true,
      section: false,
      walk: false,
    },
  };
}
