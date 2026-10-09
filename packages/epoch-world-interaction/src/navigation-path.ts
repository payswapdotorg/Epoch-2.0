/**
 * epoch-world-interaction plan/section path 计算。
 *
 * W007 spec：实现至少一个 plan/section path。这里两个都给：
 *
 * - computePlanViewPath：俯视正交风格导航预设。Babylon ArcRotateCamera
 *   以 look-at + 高 position.y + 大 radius 近似俯视正交投影（descriptor
 *   capabilities.plan === true）。返回 renderer-neutral NavigationInput
 *   序列描述（kind/position/target/zoomFactor），由宿主编排到
 *   rendererSession.navigate。
 *
 * - computeSectionCutPath：capability boundary 诚实实现——Babylon descriptor
 *   capabilities.section === false（W004 冻结），几何剖切未实现。这里以图层
 *   可见性序列作为「视觉剖切」等价投影：隐藏 ENVELOPE/MEP/FINISHES 等外壳
 *   图层以暴露 STRUCTURE 内部。仍只走 renderer-neutral setVisibility
 *   （invariant #6：不引入引擎特定 surface 类型）。
 */
import type { Vec3 } from "@zcode/epoch-world-presentation";
import type { PlanViewNavigationPath, SectionCutPath } from "./contract.ts";

/** 默认剖切隐藏的图层（按 fixture 六层语义：先隐藏 FINISHES/MEP/ENVELOPE 暴露 STRUCTURE）。 */
export const DEFAULT_SECTION_HIDDEN_LAYERS = ["FINISHES", "MEP", "ENVELOPE"] as const;

/**
 * 计算俯视导航路径。
 *
 * @param worldBounds 世界包围中心 + 半径（由宿主从表现节点 transform 推出）。
 * @returns PlanViewNavigationPath：target=中心；position=中心正上方
 *          (center.y + height)；height 取 max(radius*4, 30)；zoomFactor=1.4
 *          （轻微拉远以覆盖全图）。
 */
export function computePlanViewPath(worldBounds: {
  center: Vec3;
  radius: number;
}): PlanViewNavigationPath {
  const { center, radius } = worldBounds;
  const height = Math.max(radius * 4, 30);
  const position: Vec3 = { x: center.x, y: center.y + height, z: center.z };
  return {
    kind: "plan-view",
    target: { ...center },
    position,
    zoomFactor: 1.4,
  };
}

/**
 * 计算剖切路径：返回推荐的隐藏图层 + look-at 目标。
 *
 * capability boundary：Babylon 不支持几何剖切（descriptor.capabilities.section===false）。
 * 这里以图层可见性序列作为视觉剖切的等价投影。仍只走 renderer-neutral
 * setVisibility（invariant #6）。
 */
export function computeSectionCutPath(
  worldBounds: { center: Vec3; radius: number },
  options?: { readonly hiddenLayerIds?: readonly string[] },
): SectionCutPath {
  const hiddenLayerIds = options?.hiddenLayerIds ?? [...DEFAULT_SECTION_HIDDEN_LAYERS];
  return {
    kind: "section-cut",
    hiddenLayerIds,
    target: { ...worldBounds.center },
  };
}

/**
 * 把 PlanViewNavigationPath 转为 rendererSession.navigate 调用序列
 * （renderer-neutral NavigationInput 的 look-at + zoom）。
 * 宿主依序调用即可切到俯视视角。
 */
export function planViewPathToNavigationInputs(
  path: PlanViewNavigationPath,
): readonly [{ kind: "look-at"; target: Vec3; position: Vec3 }, { kind: "zoom"; factor: number }] {
  return [
    { kind: "look-at", target: path.target, position: path.position },
    { kind: "zoom", factor: path.zoomFactor },
  ];
}

/**
 * 把 SectionCutPath 转为 rendererSession.setVisibility 调用序列。
 * 返回 [{layerId, visible: false}, ...] ——宿主依序调用即可视觉剖切。
 */
export function sectionCutPathToVisibilityInputs(
  path: SectionCutPath,
): readonly { layerId: string; visible: false }[] {
  return path.hiddenLayerIds.map((layerId) => ({ layerId, visible: false as const }));
}
