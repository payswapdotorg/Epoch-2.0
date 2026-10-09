/**
 * epoch-renderer-three 适配器工厂与挂载编排。
 *
 * mount 流程：校验（冻结守卫）→ 创建引擎（按 engineMode）→ 构建场景图与
 * 映射 → 创建相机（home 视角）→ 装配会话 → 恢复可移植状态（worldId 不符
 * 即拒绝；digest 不符按可解析项尽力恢复，见契约 world-presentation
 * 「Portable state」）。失败路径释放已建资源。
 *
 * 与 W004 Babylon adapter 对称：mount 签名、可移植状态恢复语义、
 * 引擎模式集合（auto/webgl/null）一致——任何宿主可互换两个渲染器。
 */
import { Scene, WebGLRenderer } from "three";
import { isRendererMountOptions } from "@zcode/epoch-renderer-contract";
import type {
  InteractiveRenderer,
  RendererMountOptions,
  RendererSession,
} from "@zcode/epoch-renderer-contract";
import { isWorldPresentation } from "@zcode/epoch-world-presentation";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import { createThreeRendererDescriptor } from "./descriptor.ts";
import { isThreeRendererOptions, type ThreeRendererOptions } from "./contract.ts";
import { createSessionCamera } from "./camera.ts";
import { buildSceneGraph } from "./scene-build.ts";
import { createThreeRendererSession, type ThreeRendererSession } from "./session.ts";

const DEFAULT_HEADLESS_VIEWPORT = { width: 800, height: 600 } as const;

function canvasLikeOrNull(container: unknown): HTMLCanvasElement | null {
  if (typeof container !== "object" || container === null) return null;
  const candidate = container as Record<string, unknown>;
  if (typeof candidate.getContext !== "function") return null;
  if (typeof candidate.width !== "number" || typeof candidate.height !== "number") return null;
  return container as HTMLCanvasElement;
}

interface EngineHandle {
  readonly renderer: WebGLRenderer | null;
  readonly canvas: HTMLCanvasElement | null;
  readonly viewport: { width: number; height: number };
}

function createEngine(
  options: ThreeRendererOptions,
  mountOptions: RendererMountOptions,
): EngineHandle {
  const mode = options.engineMode ?? "auto";
  const headlessViewport = options.headlessViewport ?? DEFAULT_HEADLESS_VIEWPORT;
  if (mode === "null") {
    // 无头：不创建 WebGL 上下文；场景图与 CPU 射线拾取照常执行。
    return { renderer: null, canvas: null, viewport: headlessViewport };
  }
  // auto / webgl：需要 canvas-like 容器。
  const canvas = canvasLikeOrNull(mountOptions.container);
  if (!canvas) {
    throw new TypeError(
      "three renderer: engineMode auto/webgl requires a canvas-like container " +
        "(HTMLCanvasElement with getContext, width and height)",
    );
  }
  // 优先 WebGPU 未实现；退回 WebGL2（Three.js 默认）。canvas 已被宿主配置
  // 好上下文环境；这里只创建 WebGLRenderer。
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    stencil: true,
  });
  const width = canvas.clientWidth > 0 ? canvas.clientWidth : canvas.width;
  const height = canvas.clientHeight > 0 ? canvas.clientHeight : canvas.height;
  renderer.setSize(width, height, false);
  return { renderer, canvas, viewport: { width, height } };
}

async function mountPresentation(
  options: ThreeRendererOptions,
  presentation: WorldPresentation,
  mountOptions: RendererMountOptions,
): Promise<RendererSession> {
  if (!isWorldPresentation(presentation)) {
    throw new TypeError("three renderer: mount expects a valid WorldPresentation");
  }
  if (!isRendererMountOptions(mountOptions)) {
    throw new TypeError("three renderer: mount expects valid RendererMountOptions");
  }
  const portable = mountOptions.portableState;
  if (portable && portable.worldId !== presentation.worldId) {
    throw new TypeError(
      "three renderer: portable state belongs to a different world " +
        `(${portable.worldId} != ${presentation.worldId})`,
    );
  }
  const { renderer, canvas, viewport } = createEngine(options, mountOptions);
  const scene = new Scene();
  try {
    const { root, mapping } = buildSceneGraph(presentation);
    scene.add(root);
    const { camera, home } = createSessionCamera(root, viewport);
    const devicePixelRatio = mountOptions.devicePixelRatio ?? 1;
    if (renderer) {
      renderer.setPixelRatio(devicePixelRatio);
    }
    root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const session: ThreeRendererSession = createThreeRendererSession({
      scene,
      root,
      camera,
      home,
      mapping,
      viewport,
      canvas,
      renderer,
    });
    if (portable) {
      for (const layerId of portable.hiddenLayerIds ?? []) {
        session.setVisibility({ layerId, visible: false });
      }
      if (portable.focusedEntityId) {
        session.focus({ entityId: portable.focusedEntityId });
      }
    }
    return session;
  } catch (error) {
    if (renderer) renderer.dispose();
    scene.clear();
    throw error;
  }
}

/**
 * 适配器工厂：返回冻结契约 InteractiveRenderer。Three 类型不越过本包
 * 公共签名（contract.ts/index.ts 仅含 renderer-neutral 类型）。
 */
export function createThreeRenderer(options?: ThreeRendererOptions): InteractiveRenderer {
  if (options !== undefined && !isThreeRendererOptions(options)) {
    throw new TypeError("three renderer: invalid ThreeRendererOptions");
  }
  const resolved: ThreeRendererOptions = options ?? {};
  return {
    descriptor: () => createThreeRendererDescriptor(),
    mount: (presentation, mountOptions) => mountPresentation(resolved, presentation, mountOptions),
  };
}
