/**
 * epoch-solution-runtime 实现：宿主无关的 Solution 运行时组合。
 *
 * 职责（W007 spec）：
 * - 绑定一次 solution session 到 engine + renderer + interaction mapping
 *   （handle 由宿主注入，运行时不构造引擎/控制器——边界法）。
 * - 维护宿主无关的可移植视图状态：focused entity / layer visibility / selection /
 *   projectionMode / measurement+annotation refs（invariant #12）。
 * - 把类型化交互意图（solution.*）投影到当前 rendererSession 与 UI 投影态
 *   （invariant #11/#13：意图先解析为语义身份，再驱动下游投影；UI 不写回权威）。
 *
 * 选择/图层态存活于本运行时对象（ephemeral 投影态）——世界/解/生命周期权威
 * 不在此处（invariant #13/#14）。运行时不拥有渲染器会话的生命周期：dispose
 * 释放会话，但不关闭 Solution Surface tab（生命周期权威归控制器）。
 */
import type { WorldEntity, WorldRevision } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type { RendererHit, RendererSession } from "@zcode/epoch-renderer-contract";
import type { SolutionInteractionIntent } from "@zcode/epoch-solution-contract";
import type {
  SolutionPortableViewState,
  SolutionRuntime,
  SolutionRuntimeFactoryOptions,
  SolutionRuntimeHandle,
  SolutionRuntimeListener,
  SolutionRuntimeState,
  SolutionSelectionState,
  LayerVisibilityState,
} from "./contract.ts";

/**
 * 运行时实现：内部状态 + 监听器集合 + 派发器。
 *
 * 不持有 React 状态；UI 通过 subscribe 注册监听器读取 state 快照。
 * 派发意图时同步更新投影态并通知监听器；navigate/focus 直接调 rendererSession。
 */
export interface SolutionRuntimeImpl extends SolutionRuntime {
  /** 宿主在 open 完成后注入 handle（运行时不构造引擎/控制器）。 */
  attachHandle(handle: SolutionRuntimeHandle): void;
  /** 宿主在 dispose/close 时清除 handle。 */
  detachHandle(): Promise<void>;
  /** UI 订阅观察态变更。 */
  subscribe(listener: SolutionRuntimeListener): () => void;
  /** 渲染器命中解析后由宿主调用——把命中转为选择态。 */
  applyHit(hit: RendererHit | null): void;
}

export interface CreateSolutionRuntimeOptions extends SolutionRuntimeFactoryOptions {}

/**
 * 创建宿主无关的 Solution 运行时。
 *
 * 初始态：phase=idle、handle=null、selection=null、layerVisibility=注入或空、
 * projectionMode=注入或 "3d"、measurement/annotation refs=空数组。
 *
 * 宿主注入 handle 后，phase 变为 "open"；之后 dispatch 把意图投影到会话+态。
 */
export function createSolutionRuntime(options?: CreateSolutionRuntimeOptions): SolutionRuntimeImpl {
  const initialLayerVisibility: LayerVisibilityState = options?.initialLayerVisibility ?? {};
  const initialProjectionMode = options?.initialProjectionMode ?? "3d";
  const listeners = new Set<SolutionRuntimeListener>();

  let handle: SolutionRuntimeHandle | null = null;
  let selection: SolutionSelectionState = { entityId: null, presentationId: null };
  let layerVisibility: LayerVisibilityState = { ...initialLayerVisibility };
  let projectionMode = initialProjectionMode;
  let measurementRefs: readonly string[] = [];
  let annotationRefs: readonly string[] = [];
  let phase: SolutionRuntimeState["phase"] = "idle";
  let error: string | null = null;

  function buildState(): SolutionRuntimeState {
    return {
      handle,
      selection,
      layerVisibility,
      projectionMode,
      measurementRefs,
      annotationRefs,
      phase,
      error,
    };
  }

  function notify(): void {
    const snapshot = buildState();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // 监听器异常不影响运行时（不污染权威）。
      }
    }
  }

  function findEntity(revision: WorldRevision | null, entityId: string | null): WorldEntity | null {
    if (!revision || !entityId) return null;
    return revision.entities.find((entity) => entity.entityId === entityId) ?? null;
  }

  function findLayer(
    presentation: WorldPresentation | null,
    entityId: string | null,
  ): string | null {
    if (!presentation || !entityId) return null;
    const node = presentation.nodes.find((node) => node.entityId === entityId);
    return node?.interaction.layerIds[0] ?? null;
  }

  const runtime: SolutionRuntimeImpl = {
    get state() {
      return buildState();
    },
    get selectedEntity() {
      return findEntity(handle?.revision ?? null, selection.entityId);
    },
    get selectedLayer() {
      return findLayer(handle?.presentation ?? null, selection.entityId);
    },
    subscribe(listener: SolutionRuntimeListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attachHandle(next: SolutionRuntimeHandle): void {
      handle = next;
      // 注入 handle 时同步初始化图层可见性：如果运行时态中图层未在 handle presentation
      // 范围内出现，则保持原值；不强制覆盖（宿主可能从 portable state 恢复）。
      // projectionMode 取 handle.presentation.projectionMode（运行时不重写）。
      projectionMode = next.presentation.projectionMode;
      phase = "open";
      error = null;
      notify();
    },
    async detachHandle(): Promise<void> {
      if (handle) {
        try {
          await handle.rendererSession.dispose();
        } catch {
          // dispose 异常不阻塞（已尽力释放）。
        }
      }
      handle = null;
      phase = "idle";
      notify();
    },
    applyHit(hit: RendererHit | null): void {
      if (!handle) return;
      const session = handle.rendererSession;
      if (hit && hit.entityId) {
        selection = {
          entityId: hit.entityId,
          presentationId: hit.presentationId,
        };
        session.focus({ entityId: hit.entityId });
      } else {
        selection = { entityId: null, presentationId: null };
        session.focus({});
      }
      notify();
    },
    snapshot(): SolutionPortableViewState | null {
      if (!handle) return null;
      const presentation = handle.presentation;
      return {
        worldId: presentation.worldId,
        digest: presentation.digest,
        focusedEntityId: selection.entityId,
        selection,
        layerVisibility,
        projectionMode,
        measurementRefs,
        annotationRefs,
      };
    },
    restore(snapshot: SolutionPortableViewState): void {
      if (!handle) return;
      const presentation = handle.presentation;
      if (snapshot.worldId !== presentation.worldId) {
        // 拒绝跨世界恢复（invariant #12：身份必须存活）。
        return;
      }
      layerVisibility = { ...snapshot.layerVisibility };
      projectionMode = snapshot.projectionMode;
      measurementRefs = [...snapshot.measurementRefs];
      annotationRefs = [...snapshot.annotationRefs];
      // 选择/聚焦：恢复后调 rendererSession.focus，让渲染器高亮与投影态一致。
      const session = handle.rendererSession;
      const focused = snapshot.focusedEntityId;
      if (focused) {
        selection = { entityId: focused, presentationId: null };
        session.focus({ entityId: focused });
      } else {
        selection = { entityId: null, presentationId: null };
        session.focus({});
      }
      // 图层可见性：把 portable hiddenLayerIds 重新作用到 rendererSession。
      for (const [layerId, visible] of Object.entries(layerVisibility)) {
        session.setVisibility({ layerId, visible });
      }
      notify();
    },
    dispatch(intent: SolutionInteractionIntent): boolean | Promise<boolean> {
      if (!handle) return false;
      const session: RendererSession = handle.rendererSession;
      switch (intent.kind) {
        case "solution.navigate": {
          // 把语义导航意图投影到 rendererSession.navigate（renderer-neutral）。
          if (intent.entityIds && intent.entityIds.length > 0) {
            session.navigate({ kind: "frame", entityIds: [...intent.entityIds] });
          } else if (intent.worldPoint) {
            session.navigate({ kind: "look-at", target: intent.worldPoint });
          } else {
            session.navigate({ kind: "frame" });
          }
          return true;
        }
        case "solution.select": {
          // 选择意图：把 entityIds 投影到 selection 态 + rendererSession.focus。
          // 不写回世界权威——只是 UI 投影态。
          const first = intent.entityIds[0];
          if (first) {
            selection = { entityId: first, presentationId: null };
            session.focus({ entityId: first });
          } else {
            selection = { entityId: null, presentationId: null };
            session.focus({});
          }
          notify();
          return true;
        }
        case "solution.focus": {
          if (intent.entityId) {
            selection = { entityId: intent.entityId, presentationId: null };
            session.focus({ entityId: intent.entityId });
          } else {
            selection = { entityId: null, presentationId: null };
            session.focus({});
          }
          notify();
          return true;
        }
        case "solution.setLayerVisibility": {
          layerVisibility = { ...layerVisibility, [intent.layerId]: intent.visible };
          session.setVisibility({ layerId: intent.layerId, visible: intent.visible });
          notify();
          return true;
        }
        case "solution.measure":
        case "solution.annotate": {
          // 测量/标注的语义权威在 epoch-world-interaction（measurement/annotation
          // 注册表）；运行时只保留 refs 投影态（invariant #13）。
          // 派发到运行时态：测量/标注的 ref 由交互层生成并回报，运行时只接收。
          // 这里不直接生成 ref——宿主应通过 interaction 层创建语义对象，
          // 然后调用 runtime.applyMeasurementRef/applyAnnotationRef。
          return false;
        }
        default: {
          return false;
        }
      }
    },
    async dispose(): Promise<void> {
      await runtime.detachHandle();
      listeners.clear();
    },
    addMeasurementRef(ref: string): void {
      if (!ref || measurementRefs.includes(ref)) return;
      measurementRefs = [...measurementRefs, ref];
      notify();
    },
    removeMeasurementRef(ref: string): void {
      measurementRefs = measurementRefs.filter((existing) => existing !== ref);
      notify();
    },
    addAnnotationRef(ref: string): void {
      if (!ref || annotationRefs.includes(ref)) return;
      annotationRefs = [...annotationRefs, ref];
      notify();
    },
    removeAnnotationRef(ref: string): void {
      annotationRefs = annotationRefs.filter((existing) => existing !== ref);
      notify();
    },
  };

  return runtime;
}

/** 测试钩子：从运行时态读 layerVisibility（白盒断言用）。 */
export function readRuntimeLayerVisibility(runtime: SolutionRuntime): LayerVisibilityState {
  return runtime.state.layerVisibility;
}

/** 测试钩子：从运行时态读 selection（白盒断言用）。 */
export function readRuntimeSelection(runtime: SolutionRuntime): SolutionSelectionState {
  return runtime.state.selection;
}
