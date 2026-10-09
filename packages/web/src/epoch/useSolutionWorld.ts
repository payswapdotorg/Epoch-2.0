/**
 * useSolutionWorld — Web 端 Solution 宿主的渲染/导航/选择/图层编排 hook。
 *
 * 职责（W005 req #3-#6）：
 * - 挂载 Babylon 渲染器到画布（world-dominant 全幅世界，fixture 即开即现）；
 * - 真实导航：pointer 拖拽 -> session.navigate(orbit/pan)，wheel -> zoom（renderer-neutral 契约）；
 * - 语义选择：pointer click -> session.hitTest -> RendererHit.entityId -> 选中 + focus（interaction.md 解析链）；
 * - 图层控制：session.setVisibility 切换 fixture 六层。
 *
 * UI 始终是投影：选中态/图层态存活于本 hook 的 React state（ephemeral），
 * 不写回世界/解/生命周期权威（ARCHITECTURE-LOCK #13）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSolutionHostCompositionRoot } from "./compositionRoot.js";
import type { SolutionHostCompositionRoot, SolutionHostOpenResult } from "./contract.js";
import type { WorldEntity, WorldRevision } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import { fixtureLayerIds } from "./fixturePresentation.js";

const DRAG_THRESHOLD_PX = 4;
const ORBIT_DEG_PER_PX = 0.28;
const ZOOM_FACTOR_UP = 1.12;
const ZOOM_FACTOR_DOWN = 1 / 1.12;

export interface SolutionWorldState {
  readonly phase: "idle" | "opening" | "open" | "error";
  readonly error: string | null;
  readonly openResult: SolutionHostOpenResult | null;
  readonly selectedEntityId: string | null;
  readonly hiddenLayers: Readonly<Record<string, boolean>>;
}

export interface SolutionWorldApi {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly state: SolutionWorldState;
  readonly selectedEntity: WorldEntity | null;
  readonly selectedLayer: string | null;
  readonly reopen: () => Promise<void>;
  readonly resetView: () => void;
  readonly toggleLayer: (layerId: string, visible: boolean) => void;
  readonly onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  readonly onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  readonly onContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

function initialHiddenLayers(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const id of fixtureLayerIds()) map[id] = false;
  return map;
}

function findEntity(revision: WorldRevision | null, entityId: string | null): WorldEntity | null {
  if (!revision || !entityId) return null;
  return revision.entities.find((entity) => entity.entityId === entityId) ?? null;
}

function findLayer(presentation: WorldPresentation | null, entityId: string | null): string | null {
  if (!presentation || !entityId) return null;
  const node = presentation.nodes.find((n) => n.entityId === entityId);
  return node?.interaction.layerIds[0] ?? null;
}

export function useSolutionWorld(): SolutionWorldApi {
  const rootRef = useRef<SolutionHostCompositionRoot | null>(null);
  if (rootRef.current === null) {
    rootRef.current = createSolutionHostCompositionRoot();
  }
  const root = rootRef.current;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    button: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const [phase, setPhase] = useState<SolutionWorldState["phase"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [openResult, setOpenResult] = useState<SolutionHostOpenResult | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<Record<string, boolean>>(initialHiddenLayers);

  // refs 镜像：openSolution 读当前态而不进入 useCallback 依赖，避免 setState ->
  // 依赖变更 -> effect 重跑 -> 再 setState 的无限循环（React max update depth）。
  const openResultRef = useRef<SolutionHostOpenResult | null>(null);
  const hiddenLayersRef = useRef<Record<string, boolean>>(hiddenLayers);
  const selectedEntityIdRef = useRef<string | null>(selectedEntityId);
  openResultRef.current = openResult;
  hiddenLayersRef.current = hiddenLayers;
  selectedEntityIdRef.current = selectedEntityId;

  const openSolution = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase("opening");
    setError(null);
    try {
      const dpr = window.devicePixelRatio || 1;
      const prev = openResultRef.current;
      const hidden = hiddenLayersRef.current;
      const focused = selectedEntityIdRef.current;
      const portable = prev
        ? {
            worldId: prev.presentation.worldId,
            digest: prev.presentation.digest,
            hiddenLayerIds: Object.entries(hidden)
              .filter(([, isHidden]) => isHidden)
              .map(([id]) => id),
            focusedEntityId: focused ?? undefined,
          }
        : undefined;
      const result = await root.openReferenceSolution(canvas, dpr, portable);
      setOpenResult(result);
      setPhase("open");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [root]);

  useEffect(() => {
    void openSolution();
    return () => {
      void root.dispose();
    };
  }, [openSolution, root]);

  const session = openResult?.rendererSession ?? null;

  const resetView = useCallback(() => {
    session?.navigate({ kind: "frame" });
  }, [session]);

  const toggleLayer = useCallback(
    (layerId: string, visible: boolean) => {
      session?.setVisibility({ layerId, visible });
      setHiddenLayers((prev) => ({ ...prev, [layerId]: !visible }));
    },
    [session],
  );

  const selectAt = useCallback(
    async (x: number, y: number) => {
      if (!session) return;
      const hit = await session.hitTest({ x, y });
      if (hit && hit.entityId) {
        setSelectedEntityId(hit.entityId);
        session.focus({ entityId: hit.entityId });
      } else {
        setSelectedEntityId(null);
        session.focus({});
      }
    },
    [session],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!session) return;
      const canvas = e.currentTarget;
      canvas.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        button: e.button,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
    },
    [session],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !session) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      if (drag.button === 0) {
        session.navigate({
          kind: "orbit",
          deltaYawDeg: -dx * ORBIT_DEG_PER_PX,
          deltaPitchDeg: -dy * ORBIT_DEG_PER_PX,
        });
      } else {
        session.navigate({ kind: "pan", deltaX: -dx, deltaY: -dy });
      }
      drag.startX = e.clientX;
      drag.startY = e.clientY;
    },
    [session],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) {
        dragRef.current = null;
        return;
      }
      const canvas = e.currentTarget;
      try {
        canvas.releasePointerCapture(drag.pointerId);
      } catch {
        // pointer 已释放或画布已卸载时忽略
      }
      dragRef.current = null;
      if (!drag.moved && drag.button === 0) {
        const rect = canvas.getBoundingClientRect();
        void selectAt(e.clientX - rect.left, e.clientY - rect.top);
      }
    },
    [selectAt],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!session) return;
      const factor = e.deltaY < 0 ? ZOOM_FACTOR_UP : ZOOM_FACTOR_DOWN;
      session.navigate({ kind: "zoom", factor });
    },
    [session],
  );

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  }, []);

  const state: SolutionWorldState = useMemo(
    () => ({ phase, error, openResult, selectedEntityId, hiddenLayers }),
    [phase, error, openResult, selectedEntityId, hiddenLayers],
  );

  return {
    canvasRef,
    state,
    selectedEntity: findEntity(openResult?.revision ?? null, selectedEntityId),
    selectedLayer: findLayer(openResult?.presentation ?? null, selectedEntityId),
    reopen: openSolution,
    resetView,
    toggleLayer,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    onContextMenu,
  };
}
