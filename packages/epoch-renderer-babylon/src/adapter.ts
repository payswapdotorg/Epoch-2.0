/**
 * epoch-renderer-babylon 适配器工厂与挂载编排。
 *
 * mount 流程：校验（冻结守卫）→ 创建引擎（按 engineMode）→ 构建场景图与
 * 映射 → 计算包围球 → 创建相机（home 视角）→ 预热一帧 → 装配会话 →
 * 恢复可移植状态（worldId 不符即拒绝；digest 不符按可解析项尽力恢复，
 * 见契约 world-presentation「Portable state」）。失败路径释放已建资源。
 */
import { Color4, Engine, NullEngine, Scene } from "@babylonjs/core";
import type { AbstractEngine } from "@babylonjs/core";
import { isRendererMountOptions } from "@zcode/epoch-renderer-contract";
import type {
  InteractiveRenderer,
  RendererMountOptions,
  RendererSession,
} from "@zcode/epoch-renderer-contract";
import { isWorldPresentation } from "@zcode/epoch-world-presentation";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import { createBabylonRendererDescriptor } from "./descriptor.ts";
import { isBabylonRendererOptions, type BabylonRendererOptions } from "./contract.ts";
import { computeWorldBounds, createSessionCamera } from "./camera.ts";
import { buildSceneGraph } from "./scene-build.ts";
import { createBabylonRendererSession, type BabylonRendererSession } from "./session.ts";

const DEFAULT_HEADLESS_VIEWPORT = { width: 800, height: 600 } as const;

function canvasLikeOrNull(container: unknown): HTMLCanvasElement | null {
  if (typeof container !== "object" || container === null) return null;
  const candidate = container as Record<string, unknown>;
  if (typeof candidate.getContext !== "function") return null;
  if (typeof candidate.width !== "number" || typeof candidate.height !== "number") return null;
  return container as HTMLCanvasElement;
}

function createEngine(
  options: BabylonRendererOptions,
  mountOptions: RendererMountOptions,
): { engine: AbstractEngine; canvas: HTMLCanvasElement | null } {
  const mode = options.engineMode ?? "auto";
  if (mode === "null") {
    const viewport = options.headlessViewport ?? DEFAULT_HEADLESS_VIEWPORT;
    return {
      engine: new NullEngine({
        renderWidth: viewport.width,
        renderHeight: viewport.height,
        textureSize: 512,
        deterministicLockstep: false,
        lockstepMaxSteps: 4,
      }),
      canvas: null,
    };
  }
  const canvas = canvasLikeOrNull(mountOptions.container);
  if (!canvas) {
    throw new TypeError(
      "babylon renderer: engineMode auto/webgl requires a canvas-like container " +
        "(HTMLCanvasElement/OffscreenCanvas with getContext, width and height)",
    );
  }
  return { engine: new Engine(canvas, true, { stencil: true }, false), canvas };
}

async function mountPresentation(
  options: BabylonRendererOptions,
  presentation: WorldPresentation,
  mountOptions: RendererMountOptions,
): Promise<RendererSession> {
  if (!isWorldPresentation(presentation)) {
    throw new TypeError("babylon renderer: mount expects a valid WorldPresentation");
  }
  if (!isRendererMountOptions(mountOptions)) {
    throw new TypeError("babylon renderer: mount expects valid RendererMountOptions");
  }
  const portable = mountOptions.portableState;
  if (portable && portable.worldId !== presentation.worldId) {
    throw new TypeError(
      "babylon renderer: portable state belongs to a different world " +
        `(${portable.worldId} != ${presentation.worldId})`,
    );
  }
  const { engine, canvas } = createEngine(options, mountOptions);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.965, 0.97, 0.975, 1);
  try {
    const mapping = buildSceneGraph(presentation, scene);
    const bounds = computeWorldBounds(scene);
    const { camera, home } = createSessionCamera(scene, engine, bounds);
    const devicePixelRatio = mountOptions.devicePixelRatio ?? 1;
    engine.setHardwareScalingLevel(1 / devicePixelRatio);
    scene.render();
    const clientWidth = canvas
      ? canvas.clientWidth > 0
        ? canvas.clientWidth
        : canvas.width
      : engine.getRenderWidth();
    const clientHeight = canvas
      ? canvas.clientHeight > 0
        ? canvas.clientHeight
        : canvas.height
      : engine.getRenderHeight();
    const session: BabylonRendererSession = createBabylonRendererSession({
      engine,
      scene,
      camera,
      home,
      mapping,
      clientWidth,
      clientHeight,
      canvas,
    });
    if (canvas) engine.runRenderLoop(() => scene.render());
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
    scene.dispose();
    engine.dispose();
    throw error;
  }
}

/**
 * 适配器工厂：返回冻结契约 InteractiveRenderer。Babylon 类型不越过本包
 * 公共签名（contract.ts/index.ts 仅含 renderer-neutral 类型）。
 */
export function createBabylonRenderer(options?: BabylonRendererOptions): InteractiveRenderer {
  if (options !== undefined && !isBabylonRendererOptions(options)) {
    throw new TypeError("babylon renderer: invalid BabylonRendererOptions");
  }
  const resolved: BabylonRendererOptions = options ?? {};
  return {
    descriptor: () => createBabylonRendererDescriptor(),
    mount: (presentation, mountOptions) => mountPresentation(resolved, presentation, mountOptions),
  };
}
