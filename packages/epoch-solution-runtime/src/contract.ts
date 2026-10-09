/**
 * epoch-solution-runtime 公共契约：宿主无关的 Solution 运行时组合面。
 *
 * W007 边界法：
 * - 不引入任何引擎/渲染器实现类型；只消费冻结契约（renderer-contract、
 *   world-presentation、solution-contract、world-model）的公开导出。
 * - 不按 engineId 分支；不新增 surface 类型（ARCHITECTURE-LOCK #2/#8）。
 * - 把一次 solution session 绑定到 engine + renderer + interaction mapping，
 *   并暴露宿主无关的可移植投影状态（focused entity、layer visibility、
 *   selection、camera-independent view state）—— invariant #12「Portable
 *   state survives renderer switching」。
 * - UI 是投影（invariant #13）：本运行时持有的是会话级投影态，不写回世界/
 *   解/生命周期权威；选择/图层态的语义权威仍在世界模型/解权威。
 */
import type {
  RendererSession,
  RendererHit,
  InteractiveRenderer,
} from "@zcode/epoch-renderer-contract";
import type {
  PortableRendererState,
  WorldPresentation,
  WorldProjectionMode,
} from "@zcode/epoch-world-presentation";
import type { WorldRevision, WorldEntity } from "@zcode/epoch-world-model";
import type { SolutionSurfaceTab, SolutionInteractionIntent } from "@zcode/epoch-solution-contract";

/** 运行时句柄：稳定身份 tab + 世界修订 + 渲染器中立表现 + 渲染器会话 + 引擎名。 */
export interface SolutionRuntimeHandle {
  readonly tab: SolutionSurfaceTab;
  readonly revision: WorldRevision;
  readonly presentation: WorldPresentation;
  readonly renderer: InteractiveRenderer;
  readonly rendererSession: RendererSession;
  readonly engineName: string;
}

/** 选择态：当前选中的语义 entityId + 渲染器命中解析出来的展示层 presentationId。 */
export interface SolutionSelectionState {
  readonly entityId: string | null;
  readonly presentationId: string | null;
}

/** 图层可见性态：layerId -> visible。初始态为全部可见。 */
export type LayerVisibilityState = Readonly<Record<string, boolean>>;

/**
 * 宿主无关的可移植视图状态（invariant #12）。
 * 摄像机姿态不在此处（camera-dependent 视图状态属于渲染器会话，
 * 切换渲染器时由 PortableRendererState 的非摄像机字段恢复）。
 * 这里只保留摄像机无关的：聚焦实体、选择、图层、投影模式、
 * 测量/标注引用（投影态，非语义权威）。
 */
export interface SolutionPortableViewState {
  readonly worldId: string;
  readonly digest: string;
  readonly focusedEntityId: string | null;
  readonly selection: SolutionSelectionState;
  readonly layerVisibility: LayerVisibilityState;
  readonly projectionMode: WorldProjectionMode;
  readonly measurementRefs: readonly string[];
  readonly annotationRefs: readonly string[];
}

/** 宿主无关的运行时观察态（驱动 UI 投影；非权威）。 */
export interface SolutionRuntimeState {
  readonly handle: SolutionRuntimeHandle | null;
  readonly selection: SolutionSelectionState;
  readonly layerVisibility: LayerVisibilityState;
  readonly projectionMode: WorldProjectionMode;
  readonly measurementRefs: readonly string[];
  readonly annotationRefs: readonly string[];
  readonly phase: "idle" | "opening" | "open" | "error";
  readonly error: string | null;
}

/**
 * 把当前运行时观察态折算为可移植视图状态（用于跨渲染器切换、画布迁移）。
 * 不携带 GPU 状态；只携带语义投影字段。
 */
export interface SolutionRuntimeSnapshot {
  (state: SolutionRuntimeState): SolutionPortableViewState | null;
}

/** 运行时观察态变更监听器（宿主 UI 注册；运行时不持有 React 状态）。 */
export type SolutionRuntimeListener = (state: SolutionRuntimeState) => void;

/**
 * Solution 运行时（W007）：宿主无关的组合面。
 *
 * 宿主（packages/web、packages/desktop）注入引擎注册表 + 渲染器适配器 +
 * SolutionSurfaceController（W003 生命周期权威），运行时负责把一次 open 请求
 * 编排为 handle + 观察态，并通过 dispatch 解析类型化交互意图到当前会话。
 *
 * 选择/图层态是 UI 投影（invariant #13）：派生于世界模型 + 渲染器命中，
 * 不写回世界/解权威；只存活于本运行时对象。
 */
export interface SolutionRuntime {
  /** 当前观察态（驱动 UI 投影）。 */
  readonly state: SolutionRuntimeState;
  /** 选中实体（来自世界模型；entityId null 时返回 null）。 */
  readonly selectedEntity: WorldEntity | null;
  /** 当前选中实体所属的语义图层（来自表现节点 interaction.layerIds[0]）。 */
  readonly selectedLayer: string | null;
  /** 折算可移植视图状态（用于跨渲染器/画布迁移）。 */
  snapshot(): SolutionPortableViewState | null;
  /** 从可移植视图状态恢复（worldId 不符即拒绝）。 */
  restore(snapshot: SolutionPortableViewState): void;
  /**
   * 派发类型化交互意图到当前会话（渲染器中立；invariant #11/#13）。
   * 运行时只把意图投影到当前 rendererSession 与 UI 投影态，不写回世界/解权威。
   * 未知/未挂载会话时安全 no-op（不抛错，返回 false）。
   * @returns true if applied; false if no session or intent ignored.
   */
  dispatch(intent: SolutionInteractionIntent): boolean | Promise<boolean>;
  /** 注册一个测量引用（由 epoch-world-interaction 创建；运行时只持有 ref——投影态）。 */
  addMeasurementRef(ref: string): void;
  /** 注销一个测量引用。 */
  removeMeasurementRef(ref: string): void;
  /** 注册一个标注引用（由 epoch-world-interaction 创建；运行时只持有 ref——投影态）。 */
  addAnnotationRef(ref: string): void;
  /** 注销一个标注引用。 */
  removeAnnotationRef(ref: string): void;
  /** 订阅观察态变更（宿主 UI 注册；运行时不持有 React 状态）。 */
  subscribe(listener: SolutionRuntimeListener): () => void;
  /** 宿主在 open 完成后注入 handle（运行时不构造引擎/控制器）。 */
  attachHandle(handle: SolutionRuntimeHandle): void;
  /** 渲染器命中解析后由宿主调用——把命中转为选择态。 */
  applyHit(hit: RendererHit | null): void;
  /** 释放运行时持有的渲染器会话（幂等；不关闭 Solution Surface tab——生命周期权威归控制器）。 */
  dispose(): Promise<void>;
}

/**
 * 运行时工厂参数：宿主注入冻结能力（不在此处构造引擎/控制器）。
 *
 * - openHandle：宿主负责编排「open 参考解」（调用 SolutionSurfaceController +
 *   编译表现 + 渲染器 mount），返回运行时句柄。运行时不拥有此流程，只持有结果。
 * - initialLayerVisibility：初始图层可见性（默认全部可见）。
 */
export interface SolutionRuntimeFactoryOptions {
  readonly initialLayerVisibility?: LayerVisibilityState;
  readonly initialProjectionMode?: WorldProjectionMode;
}

export type {
  InteractiveRenderer,
  RendererHit,
  RendererSession,
  PortableRendererState,
  WorldPresentation,
  WorldProjectionMode,
  WorldRevision,
  WorldEntity,
  SolutionSurfaceTab,
  SolutionInteractionIntent,
};
