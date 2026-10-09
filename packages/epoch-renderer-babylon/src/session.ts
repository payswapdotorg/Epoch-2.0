/**
 * epoch-renderer-babylon 会话实现。
 *
 * 实现冻结契约 RendererSession 的五个方法（navigate/hitTest/setVisibility/
 * focus/dispose），并附带一个显式 resize() 扩展方法——renderer.md 允许方法
 * 分组演进（「The exact method grouping may evolve」）；resize 不携带任何
 * Babylon 类型，也不改变语义归属（纯展示层）。dispose 释放 scene/engine/
 * 观察器，可重入。
 *
 * 临时状态法则：hiddenLayerIds、聚焦高亮、相机状态全部存活于本会话对象，
 * dispose 即消失；不写回表现源，不影响世界身份。
 */
import { Color3 } from "@babylonjs/core";
import type { AbstractEngine, ArcRotateCamera, Mesh, Scene } from "@babylonjs/core";
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
import { applyNavigation, type CameraHome } from "./camera.ts";
import { HIGHLIGHT_COLOR, type PresentationNodeRecord, type SceneMapping } from "./scene-build.ts";

/** 会话依赖（内部装配；含 Babylon 类型——不越过公共签名）。 */
export interface BabylonSessionDeps {
  readonly engine: AbstractEngine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly home: CameraHome;
  readonly mapping: SceneMapping;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly canvas: HTMLCanvasElement | null;
}

/** 冻结五方法 + resize 扩展。 */
export interface BabylonRendererSession extends RendererSession {
  resize(): void;
}

/** 白盒测试钩子：会话内部依赖（不进入 index.ts 公共面）。 */
const sessionInternals = new WeakMap<BabylonRendererSession, BabylonSessionDeps>();

/** 供包内测试读取会话内部状态（相机/映射等）。 */
export function getBabylonSessionInternals(
  session: BabylonRendererSession,
): BabylonSessionDeps | undefined {
  return sessionInternals.get(session);
}

interface HighlightRestore {
  readonly emissive: (Color3 | null)[];
  readonly lineColors: (Color3 | null)[];
}

function recordIsRenderable(
  record: PresentationNodeRecord,
  hiddenLayerIds: ReadonlySet<string>,
): boolean {
  if (!record.baseVisible) return false;
  return record.layerIds.every((layerId) => !hiddenLayerIds.has(layerId));
}

/** 创建会话（装配参数由 adapter.ts 传入）。 */
export function createBabylonRendererSession(deps: BabylonSessionDeps): BabylonRendererSession {
  const { engine, scene, camera, home, mapping } = deps;
  const hiddenLayerIds = new Set<string>();
  const restoreById = new Map<string, HighlightRestore>();
  let focusedPresentationId: string | null = null;
  let disposed = false;
  let clientWidth = deps.clientWidth;
  let clientHeight = deps.clientHeight;

  function syncMeshVisibility(): void {
    for (const record of mapping.byPresentationId.values()) {
      const visible = recordIsRenderable(record, hiddenLayerIds);
      for (const mesh of record.meshes) mesh.isVisible = visible;
    }
  }

  function clearHighlight(): void {
    if (!focusedPresentationId) return;
    const record = mapping.byPresentationId.get(focusedPresentationId);
    const restore = restoreById.get(focusedPresentationId);
    if (record && restore) {
      record.meshes.forEach((mesh, index) => {
        const emissive = restore.emissive[index] ?? null;
        const lineColor = restore.lineColors[index] ?? null;
        const material = mesh.material;
        if (material && emissive && "emissiveColor" in material) {
          (material as { emissiveColor: Color3 }).emissiveColor = emissive;
        }
        if (lineColor && "color" in mesh) {
          (mesh as unknown as { color: Color3 }).color = lineColor;
        }
      });
    }
    restoreById.delete(focusedPresentationId);
    focusedPresentationId = null;
  }

  function highlightRecord(record: PresentationNodeRecord): void {
    const emissive: (Color3 | null)[] = [];
    const lineColors: (Color3 | null)[] = [];
    const accent = Color3.FromHexString(HIGHLIGHT_COLOR);
    for (const mesh of record.meshes) {
      const material = mesh.material;
      if (material && "emissiveColor" in material) {
        const typed = material as { emissiveColor: Color3 };
        emissive.push(typed.emissiveColor.clone());
        typed.emissiveColor = accent.clone();
      } else {
        emissive.push(null);
      }
      if ("color" in mesh) {
        const typed = mesh as unknown as { color: Color3 };
        lineColors.push(typed.color.clone());
        typed.color = accent.clone();
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

  function resolveHitMesh(mesh: Mesh | null): { presentationId: string; entityId?: string } | null {
    let current: { metadata?: unknown; parent: unknown } | null = mesh;
    while (current) {
      const metadata = current.metadata as { presentationId?: unknown; entityId?: unknown } | null;
      if (metadata && typeof metadata === "object" && typeof metadata.presentationId === "string") {
        return {
          presentationId: metadata.presentationId,
          entityId: typeof metadata.entityId === "string" ? metadata.entityId : undefined,
        };
      }
      current = current.parent as { metadata?: unknown; parent: unknown } | null;
    }
    return null;
  }

  syncMeshVisibility();

  let resizeObserver: ResizeObserver | null = null;
  const session: BabylonRendererSession = {
    navigate(input: NavigationInput): void {
      if (!isNavigationInput(input)) {
        throw new TypeError("babylon renderer: invalid NavigationInput");
      }
      if (disposed) return;
      applyNavigation(camera, engine, home, mapping, clientHeight, input);
    },

    async hitTest(input: HitTestInput): Promise<RendererHit | null> {
      if (!isHitTestInput(input)) {
        throw new TypeError("babylon renderer: invalid HitTestInput");
      }
      if (disposed) return null;
      const scaleX = clientWidth > 0 ? engine.getRenderWidth() / clientWidth : 1;
      const scaleY = clientHeight > 0 ? engine.getRenderHeight() / clientHeight : 1;
      const pickInfo = scene.pick(input.x * scaleX, input.y * scaleY, undefined, false, camera);
      if (!pickInfo || !pickInfo.hit || !pickInfo.pickedMesh) return null;
      const resolved = resolveHitMesh(pickInfo.pickedMesh as Mesh);
      if (!resolved) return null;
      const point = pickInfo.pickedPoint;
      return {
        presentationId: resolved.presentationId,
        ...(resolved.entityId !== undefined ? { entityId: resolved.entityId } : {}),
        ...(point ? { point: { x: point.x, y: point.y, z: point.z } } : {}),
      };
    },

    setVisibility(input: VisibilityInput): void {
      if (!isVisibilityInput(input)) {
        throw new TypeError("babylon renderer: invalid VisibilityInput");
      }
      if (disposed) return;
      if (input.visible) hiddenLayerIds.delete(input.layerId);
      else hiddenLayerIds.add(input.layerId);
      syncMeshVisibility();
    },

    focus(input: FocusInput): void {
      if (!isFocusInput(input)) {
        throw new TypeError("babylon renderer: invalid FocusInput");
      }
      if (disposed) return;
      clearHighlight();
      const target = resolveFocusTarget(input);
      if (target) highlightRecord(target);
    },

    resize(): void {
      if (disposed) return;
      if (deps.canvas && deps.canvas.clientWidth > 0 && deps.canvas.clientHeight > 0) {
        clientWidth = deps.canvas.clientWidth;
        clientHeight = deps.canvas.clientHeight;
      }
      engine.resize();
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      clearHighlight();
      restoreById.clear();
      resizeObserver?.disconnect();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };

  if (deps.canvas && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => session.resize());
    resizeObserver.observe(deps.canvas);
  }

  sessionInternals.set(session, { ...deps, clientWidth, clientHeight });
  return session;
}
