/**
 * W007 — Web 端 Solution runtime + interaction hook（additive over W005）。
 *
 * 在 W005 的 useSolutionWorld 之上叠加 runtime + interaction layer：
 * - runtime：持有 portable view state + dispatch（focused/selection/layer/measurement refs）。
 * - interaction：测量/标注注册表 + plan/section path 计算。
 *
 * 宿主 UI（Inspector / LayerControls / 测量工具）通过本 hook 读取 W007 状态。
 * 边界法：本 hook 只读取 useSolutionWorld 的 openResult + 把 handle 注入 runtime；
 * 不修改 W005 的 open/navigate/select/layer toggle 既有行为。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWorldInteraction } from "@zcode/epoch-world-interaction";
import type { WorldInteractionLayer } from "@zcode/epoch-world-interaction";
import type { SolutionRuntime } from "@zcode/epoch-solution-runtime";
import {
  createWebSolutionRuntimeWiring,
  computeFixtureWorldBounds,
  adaptOpenResultToHandle,
  buildEntityPointsFromFixture,
  type WebSolutionRuntimeWiring,
  type FixtureEntityLike,
} from "./w007Wiring.js";
import type { SolutionHostOpenResult } from "./contract.js";
import { fixtureLayerIds } from "./fixturePresentation.js";

export interface UseSolutionRuntimeApi {
  readonly runtime: SolutionRuntime;
  readonly interaction: WorldInteractionLayer;
  readonly layerIds: readonly string[];
  /** 当前测量列表（来自 interaction.measurements.list()，按 createdAt 升序）。 */
  readonly measurements: readonly { measurementId: string; displayValue: string }[];
  /** 当前标注列表。 */
  readonly annotations: readonly { annotationId: string; text: string; entityId?: string }[];
  /** 创建一个测量（两 world point）；返回 measurementId + displayValue。 */
  createMeasurement(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): { measurementId: string; displayValue: string } | null;
  /** 创建一个标注（锚定 entityId）。 */
  createAnnotation(text: string, entityId: string): { annotationId: string } | null;
  /** 应用 plan-view 导航路径到当前 rendererSession。 */
  applyPlanViewPath(): boolean;
  /** 应用 section-cut 路径（视觉剖切——隐藏 ENVELOPE/MEP/FINISHES）。 */
  applySectionCutPath(): boolean;
  /** 隔离一个图层（独显一层）。 */
  isolateLayer(layerId: string): void;
  /** 解除隔离。 */
  unisolateLayers(): void;
}

/**
 * 在 W005 的 useSolutionWorld openResult 之上叠加 runtime + interaction。
 */
export function useSolutionRuntime(
  openResult: SolutionHostOpenResult | null,
  engineName: string,
  fixtureEntities: ReadonlyArray<FixtureEntityLike>,
): UseSolutionRuntimeApi {
  const wiringRef = useRef<WebSolutionRuntimeWiring | null>(null);
  if (wiringRef.current === null) {
    wiringRef.current = createWebSolutionRuntimeWiring();
  }
  const wiring = wiringRef.current;

  // openResult 变化时把 handle 注入 runtime。useEffect 依赖只有 openResult/engineName
  // （不依赖 fixtureEntities/wiring：wiring 是 stable ref，fixtureEntities 来自 React
  // state 也是稳定 ref）。Wire 时把 entityPoints 注入 interaction layer。
  const fixtureEntitiesRef = useRef(fixtureEntities);
  fixtureEntitiesRef.current = fixtureEntities;
  useEffect(() => {
    if (!openResult) return;
    const current = wiringRef.current;
    if (!current) return;
    const entityPoints = buildEntityPointsFromFixture(fixtureEntitiesRef.current);
    const interaction = createWorldInteraction({ entityPoints });
    const handle = adaptOpenResultToHandle(openResult, engineName);
    wiringRef.current = {
      runtime: current.runtime,
      interaction,
      layerIds: [...fixtureLayerIds()],
    };
    current.runtime.attachHandle(handle);
  }, [openResult, engineName]);

  const [, forceRender] = useState(0);
  useEffect(() => {
    const unsubscribe = wiring.runtime.subscribe(() => forceRender((n) => n + 1));
    return unsubscribe;
  }, [wiring.runtime]);

  const createMeasurement = useCallback(
    (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => {
      const interaction = wiringRef.current?.interaction;
      if (!interaction) return null;
      const m = interaction.measurements.createLinear({ point: from }, { point: to });
      wiringRef.current?.runtime.addMeasurementRef(m.measurementId);
      return { measurementId: m.measurementId, displayValue: m.displayValue };
    },
    [],
  );

  const createAnnotation = useCallback((text: string, entityId: string) => {
    const interaction = wiringRef.current?.interaction;
    if (!interaction) return null;
    const ann = interaction.annotations.createNote(text, { entityId });
    if (!ann) return null;
    wiringRef.current?.runtime.addAnnotationRef(ann.annotationId);
    return { annotationId: ann.annotationId };
  }, []);

  const applyPlanViewPath = useCallback((): boolean => {
    const openResult = wiringRef.current;
    if (!openResult) return false;
    const presentation = wiring.runtime.state.handle?.presentation;
    if (!presentation) return false;
    const bounds = computeFixtureWorldBounds(presentation);
    const path = wiring.interaction.computePlanViewPath(bounds);
    const session = wiring.runtime.state.handle?.rendererSession;
    if (!session) return false;
    session.navigate({ kind: "look-at", target: path.target, position: path.position });
    session.navigate({ kind: "zoom", factor: path.zoomFactor });
    return true;
  }, [wiring]);

  const applySectionCutPath = useCallback((): boolean => {
    const presentation = wiring.runtime.state.handle?.presentation;
    if (!presentation) return false;
    const bounds = computeFixtureWorldBounds(presentation);
    const path = wiring.interaction.computeSectionCutPath(bounds);
    const session = wiring.runtime.state.handle?.rendererSession;
    if (!session) return false;
    for (const layerId of path.hiddenLayerIds) {
      session.setVisibility({ layerId, visible: false });
      wiring.runtime.dispatch({
        kind: "solution.setLayerVisibility",
        layerId,
        visible: false,
      });
    }
    session.navigate({ kind: "look-at", target: path.target });
    return true;
  }, [wiring]);

  const isolateLayer = useCallback(
    (layerId: string) => {
      const layerIds = wiringRef.current?.layerIds ?? [...fixtureLayerIds()];
      for (const id of layerIds) {
        const visible = id === layerId;
        const session = wiring.runtime.state.handle?.rendererSession;
        if (session) session.setVisibility({ layerId: id, visible });
        wiring.runtime.dispatch({
          kind: "solution.setLayerVisibility",
          layerId: id,
          visible,
        });
      }
    },
    [wiring],
  );

  const unisolateLayers = useCallback(() => {
    const layerIds = wiringRef.current?.layerIds ?? [...fixtureLayerIds()];
    for (const id of layerIds) {
      const session = wiring.runtime.state.handle?.rendererSession;
      if (session) session.setVisibility({ layerId: id, visible: true });
      wiring.runtime.dispatch({
        kind: "solution.setLayerVisibility",
        layerId: id,
        visible: true,
      });
    }
  }, [wiring]);

  const measurements = useMemo(
    () =>
      wiring.interaction.measurements.list().map((m) => ({
        measurementId: m.measurementId,
        displayValue: m.displayValue,
      })),
    // Depend on runtime.state.measurementRefs so the hook re-renders after addMeasurementRef.
    [wiring.runtime.state.measurementRefs, wiring.interaction],
  );

  const annotations = useMemo(
    () =>
      wiring.interaction.annotations.list().map((a) => ({
        annotationId: a.annotationId,
        text: a.text,
        ...(a.entityId !== undefined ? { entityId: a.entityId } : {}),
      })),
    // Depend on runtime.state.annotationRefs so the hook re-renders after addAnnotationRef.
    [wiring.runtime.state.annotationRefs, wiring.interaction],
  );

  return {
    runtime: wiring.runtime,
    interaction: wiring.interaction,
    layerIds: wiringRef.current?.layerIds ?? [...fixtureLayerIds()],
    measurements,
    annotations,
    createMeasurement,
    createAnnotation,
    applyPlanViewPath,
    applySectionCutPath,
    isolateLayer,
    unisolateLayers,
  };
}
