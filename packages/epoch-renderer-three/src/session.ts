/**
 * epoch-renderer-three 会话实现。
 *
 * 实现冻结契约 RendererSession 的五个方法（navigate/hitTest/setVisibility/
 * focus/dispose），并附带一个显式 resize() 扩展方法——renderer.md 允许方法
 * 分组演进（「The exact method grouping may evolve」）；resize 不携带任何
 * Three 类型，也不改变语义归属（纯展示层）。dispose 释放 scene/camera/
 * 渲染器与观察器，可重入。
 *
 * 临时状态法则：hiddenLayerIds、聚焦高亮、相机 home 锚点全部存活于本会话
 * 对象，dispose 即消失；不写回表现源，不影响世界身份。
 *
 * 拾取解析链（ARCHITECTURE-LOCK #11）：
 *   pointer (CSS px) → NDC → Raycaster.setFromCamera → intersectObjects
 *   → intersect.object.userData.presentationId → entityId
 * 绝不从 mesh 名推断身份（mesh 名为 "p:{i}"/"m:{i}"，刻意非语义）。
 */
import { Color, Raycaster, Vector2 } from "three";
import type { Group, Mesh, Object3D, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import {
  isFocusInput,
  isHitTestInput,
  isNavigationInput,
  isVisibilityInput,
} from "@zcode/epoch-renderer-contract";
import type {
  FocusInput,
  HitTestInput,
  NavigationInput,
  RendererHit,
  RendererSession,
  VisibilityInput,
} from "@zcode/epoch-renderer-contract";
import { applyNavigation, type CameraHome, type CameraState } from "./camera.ts";
import { HIGHLIGHT_COLOR, type PresentationNodeRecord, type SceneMapping } from "./scene-build.ts";

/** 会话依赖（内部装配；含 Three 类型——不越过公共签名）。 */
export interface ThreeSessionDeps {
  readonly scene: Scene;
  readonly root: Group;
  readonly camera: PerspectiveCamera;
  readonly home: CameraHome;
  readonly mapping: SceneMapping;
  readonly viewport: { width: number; height: number };
  readonly canvas: HTMLCanvasElement | null;
  readonly renderer: WebGLRenderer | null;
}

/** 冻结五方法 + resize 扩展。 */
export interface ThreeRendererSession extends RendererSession {
  resize(): void;
}

/** 白盒测试钩子：会话内部依赖（不进入 index.ts 公共面）。 */
const sessionInternals = new WeakMap<ThreeRendererSession, ThreeSessionDeps>();

/** 供包内测试读取会话内部状态（相机/映射等）。 */
export function getThreeSessionInternals(
  session: ThreeRendererSession,
): ThreeSessionDeps | undefined {
  return sessionInternals.get(session);
}

interface HighlightRestore {
  readonly emissive: (Color | null)[];
  readonly lineColors: (Color | null)[];
}

function recordIsRenderable(
  record: PresentationNodeRecord,
  hiddenLayerIds: ReadonlySet<string>,
): boolean {
  if (!record.baseVisible) return false;
  return record.layerIds.every((layerId) => !hiddenLayerIds.has(layerId));
}

type AnyMaterial = {
  emissive?: Color;
  color?: Color;
  dispose?: () => void;
} | null;

/** 创建会话（装配参数由 adapter.ts 传入）。 */
export function createThreeRendererSession(deps: ThreeSessionDeps): ThreeRendererSession {
  const { scene, root, camera, home, mapping } = deps;
  const hiddenLayerIds = new Set<string>();
  const restoreById = new Map<string, HighlightRestore>();
  let focusedPresentationId: string | null = null;
  let disposed = false;
  let viewport = { width: deps.viewport.width, height: deps.viewport.height };
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  // 当前相机状态（mutable）：navigate 后更新——orbit/zoom/pan 的增量基准。
  // home（deps.home）不可变——frame（无 ids）的 reset 基准，与 Babylon 同语义。
  let current: CameraState = {
    theta: home.theta,
    phi: home.phi,
    radius: home.radius,
    target: home.target.clone(),
  };

  // Three.js Raycaster 不检查 object.visible——必须用 layers 屏蔽隐藏几何
  // （与不可选几何同机制）。PICK_LAYER=0（raycaster 默认层），
  // NO_PICK_LAYER=1（raycaster 跳过）。
  const PICK_LAYER = 0;
  const NO_PICK_LAYER = 1;

  function syncMeshVisibility(): void {
    for (const record of mapping.byPresentationId.values()) {
      const visible = recordIsRenderable(record, hiddenLayerIds);
      for (const object of record.meshes) {
        object.visible = visible;
        // 可选 + 可见 -> 拾取层；否则非拾取层（隐藏/不可选都不参与拾取）。
        if (record.selectable && visible) {
          object.layers.set(PICK_LAYER);
        } else {
          object.layers.set(NO_PICK_LAYER);
        }
      }
    }
  }

  function clearHighlight(): void {
    if (!focusedPresentationId) return;
    const record = mapping.byPresentationId.get(focusedPresentationId);
    const restore = restoreById.get(focusedPresentationId);
    if (record && restore) {
      record.meshes.forEach((object, index) => {
        const emissive = restore.emissive[index] ?? null;
        const lineColor = restore.lineColors[index] ?? null;
        const material = (object as Mesh).material as AnyMaterial;
        if (material && material.emissive && emissive) {
          material.emissive.copy(emissive);
        }
        if (material && material.color && lineColor) {
          material.color.copy(lineColor);
        }
      });
    }
    restoreById.delete(focusedPresentationId);
    focusedPresentationId = null;
  }

  function highlightRecord(record: PresentationNodeRecord): void {
    const emissive: (Color | null)[] = [];
    const lineColors: (Color | null)[] = [];
    const accent = new Color(HIGHLIGHT_COLOR);
    for (const object of record.meshes) {
      const material = (object as Mesh).material as AnyMaterial;
      if (material && material.emissive) {
        emissive.push(material.emissive.clone());
        material.emissive.copy(accent);
      } else {
        emissive.push(null);
      }
      if (material && material.color) {
        lineColors.push(material.color.clone());
        material.color.copy(accent);
      } else {
        lineColors.push(null);
      }
    }
    restoreById.set(record.presentationId, { emissive, lineColors });
    focusedPresentationId = record.presentationId;
  }

  function resolveFocusTarget(input: FocusInput): PresentationNodeRecord | null {
    if (input.entityId) {
      const presentationIds = mapping.presentationIdsByEntityId.get(input.entityId);
      if (presentationIds && presentationIds.length > 0) {
        const record = mapping.byPresentationId.get(presentationIds[0]!);
        if (record) return record;
      }
    }
    if (input.presentationId) {
      return mapping.byPresentationId.get(input.presentationId) ?? null;
    }
    return null;
  }

  function resolveHitObject(
    object: Object3D | null,
  ): { presentationId: string; entityId?: string } | null {
    let current: Object3D | null = object;
    while (current) {
      const userData = current.userData as { presentationId?: unknown; entityId?: unknown } | null;
      if (userData && typeof userData === "object" && typeof userData.presentationId === "string") {
        return {
          presentationId: userData.presentationId,
          entityId: typeof userData.entityId === "string" ? userData.entityId : undefined,
        };
      }
      current = current.parent;
    }
    return null;
  }

  syncMeshVisibility();

  let resizeObserver: ResizeObserver | null = null;
  let animationId: number | null = null;

  const session: ThreeRendererSession = {
    navigate(input: NavigationInput): void {
      if (!isNavigationInput(input)) {
        throw new TypeError("three renderer: invalid NavigationInput");
      }
      if (disposed) return;
      current = applyNavigation(camera, home, current, mapping, viewport, input);
    },

    async hitTest(input: HitTestInput): Promise<RendererHit | null> {
      if (!isHitTestInput(input)) {
        throw new TypeError("three renderer: invalid HitTestInput");
      }
      if (disposed) return null;
      if (viewport.width <= 0 || viewport.height <= 0) return null;
      // CSS 像素 → NDC（[-1, 1]，y 翻转：屏幕 y 向下、NDC y 向上）。
      ndc.x = (input.x / viewport.width) * 2 - 1;
      ndc.y = -((input.y / viewport.height) * 2 - 1);
      // 确保 matrixWorld/matrixWorldInverse 最新（导航后相机已更新）。
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObjects(root.children, true);
      // 按距离排序的结果中找第一个能解析到 presentationId 的（不可选几何
      // 已通过 layers 屏蔽，raycaster 不会返回它们）。
      for (const intersect of intersects) {
        const resolved = resolveHitObject(intersect.object);
        if (!resolved) continue;
        const point = intersect.point;
        return {
          presentationId: resolved.presentationId,
          ...(resolved.entityId !== undefined ? { entityId: resolved.entityId } : {}),
          ...(point ? { point: { x: point.x, y: point.y, z: point.z } } : {}),
        };
      }
      return null;
    },

    setVisibility(input: VisibilityInput): void {
      if (!isVisibilityInput(input)) {
        throw new TypeError("three renderer: invalid VisibilityInput");
      }
      if (disposed) return;
      if (input.visible) hiddenLayerIds.delete(input.layerId);
      else hiddenLayerIds.add(input.layerId);
      syncMeshVisibility();
    },

    focus(input: FocusInput): void {
      if (!isFocusInput(input)) {
        throw new TypeError("three renderer: invalid FocusInput");
      }
      if (disposed) return;
      clearHighlight();
      const target = resolveFocusTarget(input);
      if (target) highlightRecord(target);
    },

    resize(): void {
      if (disposed) return;
      if (deps.canvas && deps.canvas.clientWidth > 0 && deps.canvas.clientHeight > 0) {
        viewport = { width: deps.canvas.clientWidth, height: deps.canvas.clientHeight };
        if (deps.renderer) {
          deps.renderer.setSize(viewport.width, viewport.height, false);
          camera.aspect = viewport.width / viewport.height;
          camera.updateProjectionMatrix();
        }
      }
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      clearHighlight();
      restoreById.clear();
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
      // 遍历释放几何/材质（防止 GPU 内存泄漏，无头模式亦无害）。
      root.traverse((object) => {
        const mesh = object as Mesh;
        const geometry = mesh.geometry;
        if (geometry) geometry.dispose();
        const material = mesh.material as AnyMaterial;
        if (material && typeof material.dispose === "function") {
          material.dispose();
        }
      });
      if (deps.renderer) {
        deps.renderer.dispose();
      }
      // scene 本身在 WebGL 模式下由 renderer.dispose 隐式释放；这里显式 release force。
      void scene;
    },
  };

  // WebGL 模式：启动渲染循环。
  if (deps.renderer && deps.canvas) {
    const render = (): void => {
      if (disposed) return;
      deps.renderer!.render(scene, camera);
      animationId = requestAnimationFrame(render);
    };
    animationId = requestAnimationFrame(render);
  }

  if (deps.canvas && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => session.resize());
    resizeObserver.observe(deps.canvas);
  }

  sessionInternals.set(session, { ...deps, viewport });
  return session;
}
