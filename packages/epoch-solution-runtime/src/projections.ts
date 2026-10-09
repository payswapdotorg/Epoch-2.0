/**
 * epoch-solution-runtime 图层隔离与下游投影链接辅助。
 *
 * W007 acceptance：
 * - layer isolate（solo one layer）：图层控件必须支持 isolate（独显一层），
 *   不仅是可见性切换。实现为：保留目标层可见，隐藏其他全部层。
 *   仍只走 renderer-neutral RendererSession.setVisibility（invariant #6：
 *   不引入引擎特定 surface 类型）。
 *
 * - downstream projection link（invariant #13/#14）：选中实体必须能投影到
 *   下游：图层、phase、properties、以及至少一个下游投影（BOQ-ish 数量汇总
 *   直接读自世界模型的 quantity 字段，或 constraint 引用）。projection ONLY，
 *   绝不成为第二个 BOQ 权威。
 */
import type { WorldEntity, QuantityValue } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type { RendererSession } from "@zcode/epoch-renderer-contract";
import type { SolutionRuntime, LayerVisibilityState } from "./contract.ts";

/**
 * Solo 一个图层：保留 targetLayer 可见，隐藏其他全部图层。
 * 调用方需提供完整的已知图层列表（来自 fixtureLayerIds）。
 * 返回新的图层可见性态（不可变快照）。
 *
 * 注意：图层可见性态存活于运行时对象（UI 投影），不写回世界权威。
 */
export function isolateLayer(
  runtime: SolutionRuntime,
  _session: RendererSession | null,
  layerIds: readonly string[],
  targetLayer: string,
): LayerVisibilityState {
  const next: Record<string, boolean> = {};
  for (const id of layerIds) {
    const visible = id === targetLayer;
    next[id] = visible;
    // dispatch 内部已调 rendererSession.setVisibility + 同步 runtime 态；
    // 不再直接调 session，避免重复 setVisibility。
    runtime.dispatch({
      kind: "solution.setLayerVisibility",
      layerId: id,
      visible,
    });
  }
  return next;
}

/** 解除隔离：全部图层恢复可见。 */
export function unisolateLayers(
  runtime: SolutionRuntime,
  _session: RendererSession | null,
  layerIds: readonly string[],
): LayerVisibilityState {
  const next: Record<string, boolean> = {};
  for (const id of layerIds) {
    next[id] = true;
    runtime.dispatch({
      kind: "solution.setLayerVisibility",
      layerId: id,
      visible: true,
    });
  }
  return next;
}

/**
 * 实体的工程数量投影：直接读自世界模型的 entity.quantity 字段（projection ONLY，
 * invariant #14：不引入第二个 BOQ 权威）。返回 null 表示实体未携带数量。
 */
export function readEntityQuantity(entity: WorldEntity | null): QuantityValue | null {
  if (!entity || !entity.quantity) return null;
  return entity.quantity;
}

/**
 * 实体的约束引用投影：读自世界模型的 entity.constraints 字段。
 * 这些是引用（constraintId 字符串集合），不是约束定义本身——
 * 定义在 fixture semantics（W002 冻结）；这里只投影引用。
 */
export function readEntityConstraintRefs(entity: WorldEntity | null): readonly string[] {
  if (!entity || !entity.constraints) return [];
  return entity.constraints;
}

/**
 * 实体的下游投影汇总：图层（来自表现节点）、phase（来自世界模型）、
 * properties（dimensions/quantity/material）、以及一个 BOQ-ish 数量投影
 * （直接读 entity.quantity）+ 约束引用（read-only projection）。
 *
 * 本函数纯投影——不写回任何权威，不创建第二个 BOQ。
 */
export interface EntityDownstreamProjection {
  readonly entityId: string;
  readonly layer: string | null;
  readonly phase: string | null;
  readonly properties: Readonly<Record<string, string>>;
  readonly quantity: QuantityValue | null;
  readonly constraintRefs: readonly string[];
}

/**
 * 从世界模型 + 渲染器中立表现中投影实体的下游视图。
 *
 * @param presentation 渲染器中立表现（含图层成员关系）
 * @param entity 选中实体（来自世界模型）
 */
export function projectEntityDownstream(
  presentation: WorldPresentation | null,
  entity: WorldEntity | null,
): EntityDownstreamProjection | null {
  if (!entity) return null;
  const layer = findLayerForEntity(presentation, entity.entityId);
  const properties: Record<string, string> = {};
  if (entity.dimensions) {
    for (const [key, qty] of Object.entries(entity.dimensions)) {
      properties[key] = `${qty.value} ${qty.unit}`;
    }
  }
  if (entity.material) {
    properties.material = entity.material.grade
      ? `${entity.material.type} · ${entity.material.grade}`
      : entity.material.type;
  }
  if (entity.status) {
    properties.status = entity.status;
  }
  return {
    entityId: entity.entityId,
    layer,
    phase: entity.phase ?? null,
    properties,
    quantity: readEntityQuantity(entity),
    constraintRefs: readEntityConstraintRefs(entity),
  };
}

function findLayerForEntity(
  presentation: WorldPresentation | null,
  entityId: string,
): string | null {
  if (!presentation) return null;
  const node = presentation.nodes.find((node) => node.entityId === entityId);
  return node?.interaction.layerIds[0] ?? null;
}
