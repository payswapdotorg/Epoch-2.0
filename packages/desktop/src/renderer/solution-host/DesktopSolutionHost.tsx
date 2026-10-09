/**
 * Desktop Solution Host — world-dominant solution view (W006).
 *
 * 不变量 3（world is not decoration）：Solution 打开时世界画布是占主导的全幅工作区，
 * 立即可见、可直接导航；绝不以 dashboard / 空状态 / 占位符代替世界。
 *
 * 不变量 11（selection is semantic）：点击经渲染器命中测试解析为 Epoch entityId
 * （presentationId -> node -> entityId），inspector 显示该实体的语义，UI 不从 mesh 名推断身份。
 *
 * 不变量 15（workstation parity）：复用与 Web 相同的 SolutionSurfaceController + fixture 引擎 +
 * Babylon 渲染器；平台差异只在本组件的 DOM 挂载/事件接线上（host concern）。
 *
 * 最小改动法：本组件是 renderer 进程内的 solution-host 装配，不重建桌面平台。
 * packages/ui（W003 冻结）未提供 solution 内容注入缝，故桌面宿主以全幅 overlay 形式
 * 持有世界画布；workbench <Root> 仍被挂载（在 main.tsx），通过「显示工作台」开关切换可见。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { RendererHit, RendererSession } from "@zcode/epoch-renderer-contract";
import {
  createDesktopSolutionRuntime,
  type DesktopSolutionRuntime,
} from "./desktopSolutionRuntime.js";
import {
  buttonStyle,
  canvasStyle,
  errorBoxStyle,
  hiddenStyle,
  hintStyle,
  inspectorRowStyle,
  layerRowStyle,
  linkButtonStyle,
  overlayStyle,
  panelTitleRowStyle,
  panelTitleStyle,
  readyDotStyle,
  reopenButtonStyle,
  rightPanelStyle,
  titleStyle,
  hudTopBarStyle,
} from "./desktopSolutionHostStyles.js";

const ORBIT_DEG_PER_PIXEL = 0.3;
const CLICK_MOVEMENT_THRESHOLD = 5;
const LAYER_LABELS: Readonly<Record<string, string>> = {
  SITE: "Site",
  FOUNDATION: "Foundation",
  STRUCTURE: "Structure",
  ENVELOPE: "Envelope",
  MEP: "MEP",
  FINISHES: "Finishes",
};

interface EntityInspectorData {
  readonly entityId: string;
  readonly entityType: string;
  readonly label: string;
  readonly layer: string;
  readonly materialType?: string;
  readonly materialGrade?: string;
  readonly dimensions?: ReadonlyArray<readonly [string, string]>;
  readonly quantity?: string;
  readonly phase?: string;
  readonly status?: string;
}

function formatQuantity(value: unknown, unit: unknown): string | undefined {
  if (typeof value !== "number" || typeof unit !== "string") return undefined;
  return `${value} ${unit}`;
}

function describeEntity(runtime: DesktopSolutionRuntime, entityId: string): EntityInspectorData {
  const entity = runtime.entityById.get(entityId);
  const layer = entity?.layer ?? "STRUCTURE";
  const dims = entity?.dimensions;
  const dimensions = dims
    ? (Object.entries(dims).map(
        ([key, q]) => [key, `${q.value} ${q.unit}`] as const,
      ) as ReadonlyArray<readonly [string, string]>)
    : undefined;
  return {
    entityId,
    entityType: entity?.entityType ?? "—",
    label: entity?.label ?? entityId,
    layer,
    materialType: entity?.material?.type,
    materialGrade: entity?.material?.grade,
    dimensions,
    quantity: entity?.quantity
      ? formatQuantity(entity.quantity.value, entity.quantity.unit)
      : undefined,
    phase: entity?.phase,
    status: entity?.status,
  };
}

/**
 * 全幅世界宿主：构建运行时 → 挂载 Babylon → 接线相机/选择/图层。
 * 默认可见（世界主导）；「显示工作台」隐藏 overlay 以露出 workbench <Root>。
 * overlay 隐藏后，一个「重新打开 Solution 世界」浮按钮挂在顶层 document 上，
 * 避免被困在 display:none 的容器里。
 */
export function DesktopSolutionHost() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<RendererSession | null>(null);
  const runtimeRef = useRef<DesktopSolutionRuntime | null>(null);
  const dragStateRef = useRef({
    down: false,
    lastX: 0,
    lastY: 0,
    movement: 0,
    shift: false,
  });

  const [runtime, setRuntime] = useState<DesktopSolutionRuntime | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [layerVisible, setLayerVisible] = useState<Record<string, boolean>>({});
  const [overlayVisible, setOverlayVisible] = useState(true);

  // 1. 组装默认 Solution 运行时（零用户配置：注册 fixture 引擎 + Babylon 渲染器 + 控制器 open）。
  useEffect(() => {
    let cancelled = false;
    createDesktopSolutionRuntime()
      .then((result) => {
        if (cancelled) return;
        runtimeRef.current = result;
        const initial: Record<string, boolean> = {};
        for (const layerId of result.layerIds) initial[layerId] = true;
        setLayerVisible(initial);
        setRuntime(result);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const message = failure instanceof Error ? failure.message : String(failure);
        setError(`Solution runtime failed: ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 运行时 + canvas 就绪后挂载 Babylon 渲染器（世界画布全幅）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !runtime) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    let disposed = false;
    runtime.renderer
      .mount(runtime.presentation, { container: canvas, devicePixelRatio: dpr })
      .then((session) => {
        if (disposed) {
          void session.dispose();
          return;
        }
        sessionRef.current = session;
        setReady(true);
      })
      .catch((failure: unknown) => {
        if (disposed) return;
        const message = failure instanceof Error ? failure.message : String(failure);
        setError(`Renderer mount failed: ${message}`);
      });
    return () => {
      disposed = true;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.dispose();
    };
  }, [runtime]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!sessionRef.current) return;
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
    dragStateRef.current = {
      down: true,
      lastX: event.clientX,
      lastY: event.clientY,
      movement: 0,
      shift: event.shiftKey,
    };
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const state = dragStateRef.current;
    if (!state.down || !sessionRef.current) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.movement += Math.abs(dx) + Math.abs(dy);
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    const session = sessionRef.current;
    if (event.shiftKey || state.shift) {
      session.navigate({ kind: "pan", deltaX: dx, deltaY: dy });
    } else {
      session.navigate({
        kind: "orbit",
        deltaYawDeg: dx * ORBIT_DEG_PER_PIXEL,
        deltaPitchDeg: dy * ORBIT_DEG_PER_PIXEL,
      });
    }
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const state = dragStateRef.current;
    state.down = false;
    (event.target as HTMLCanvasElement).releasePointerCapture?.(event.pointerId);
    const session = sessionRef.current;
    if (!session || state.movement > CLICK_MOVEMENT_THRESHOLD) return;
    // 点击命中测试：renderer 适配器归一化 -> Epoch entityId（invariant 11）。
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    void session
      .hitTest({ x, y })
      .then((hit: RendererHit | null) => {
        const entityId = hit?.entityId ?? null;
        setSelectedEntityId(entityId);
        if (entityId) session.focus({ entityId });
        else session.focus({});
      })
      .catch(() => {
        setSelectedEntityId(null);
      });
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    const session = sessionRef.current;
    if (!session) return;
    const factor = Math.min(5, Math.max(0.2, 1 - event.deltaY * 0.0015));
    session.navigate({ kind: "zoom", factor });
  }, []);

  const toggleLayer = useCallback((layerId: string, visible: boolean) => {
    const session = sessionRef.current;
    if (session) session.setVisibility({ layerId, visible });
    setLayerVisible((current) => ({ ...current, [layerId]: visible }));
  }, []);

  const resetView = useCallback(() => {
    sessionRef.current?.navigate({ kind: "frame" });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntityId(null);
    sessionRef.current?.focus({});
  }, []);

  const inspector = runtime && selectedEntityId ? describeEntity(runtime, selectedEntityId) : null;

  if (error) {
    return (
      <div style={overlayStyle}>
        <div style={errorBoxStyle}>
          <strong>Solution Host Error</strong>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={overlayVisible ? overlayStyle : hiddenStyle}
        aria-label="Epoch Solution world"
        aria-hidden={!overlayVisible}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          style={canvasStyle}
          data-testid="epoch-world-canvas"
        />
        <div style={hudTopBarStyle}>
          <div style={titleStyle}>
            <strong>Epoch Solution</strong>
            <span style={{ opacity: 0.7, marginLeft: 8 }}>
              {runtime ? `${runtime.engineName} · ${runtime.tab.solutionId}` : "opening…"}
            </span>
            {ready ? <span style={readyDotStyle} title="world ready" /> : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={resetView} style={buttonStyle} disabled={!ready}>
              Reset view
            </button>
            <button type="button" onClick={() => setOverlayVisible(false)} style={buttonStyle}>
              Show workbench
            </button>
          </div>
        </div>
        <div style={rightPanelStyle}>
          {inspector ? (
            <>
              <div style={panelTitleRowStyle}>
                <span style={panelTitleStyle}>Inspector</span>
                <button type="button" onClick={clearSelection} style={linkButtonStyle}>
                  clear
                </button>
              </div>
              <div style={inspectorRowStyle}>
                <strong>{inspector.label}</strong>
              </div>
              <div style={inspectorRowStyle}>
                entityId: <code>{inspector.entityId}</code>
              </div>
              <div style={inspectorRowStyle}>type: {inspector.entityType}</div>
              <div style={inspectorRowStyle}>
                layer: {LAYER_LABELS[inspector.layer] ?? inspector.layer}
              </div>
              {inspector.materialType ? (
                <div style={inspectorRowStyle}>
                  material: {inspector.materialType}
                  {inspector.materialGrade ? ` · ${inspector.materialGrade}` : ""}
                </div>
              ) : null}
              {inspector.dimensions?.length ? (
                <div style={inspectorRowStyle}>
                  dimensions:
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {inspector.dimensions.map(([key, value]) => (
                      <li key={key}>
                        {key}: {value}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {inspector.quantity ? (
                <div style={inspectorRowStyle}>quantity: {inspector.quantity}</div>
              ) : null}
              {inspector.phase ? (
                <div style={inspectorRowStyle}>phase: {inspector.phase}</div>
              ) : null}
              {inspector.status ? (
                <div style={inspectorRowStyle}>status: {inspector.status}</div>
              ) : null}
            </>
          ) : (
            <>
              <div style={panelTitleStyle}>Layers</div>
              {runtime?.layerIds.map((layerId) => (
                <label key={layerId} style={layerRowStyle}>
                  <input
                    type="checkbox"
                    checked={layerVisible[layerId] ?? true}
                    onChange={(event) => toggleLayer(layerId, event.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  {LAYER_LABELS[layerId] ?? layerId}
                </label>
              ))}
              <div style={{ ...inspectorRowStyle, marginTop: 8, opacity: 0.7 }}>
                Click an entity to inspect its semantics.
              </div>
            </>
          )}
        </div>
        <div style={hintStyle}>Drag: orbit · Shift+drag: pan · Wheel: zoom · Click: select</div>
      </div>
      {!overlayVisible ? (
        <button type="button" onClick={() => setOverlayVisible(true)} style={reopenButtonStyle}>
          Show Solution world
        </button>
      ) : null}
    </>
  );
}
