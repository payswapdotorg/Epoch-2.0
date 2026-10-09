/**
 * epoch-world-interaction 公共契约：交互层语义权威面。
 *
 * W007 spec：实现 plan/section path 计算（plan-view navigation preset 或
 * section cut plane）+ measurement/annotation semantics（world-anchored,
 * stable under renderer switch, stored as projection state — never a
 * second semantic authority, invariant #13/#14）。
 *
 * - 测量/标注是世界锚定的投影态：附着 entityId 和/或世界坐标；渲染器只
 *   提供观测点（interaction.md「Measurement」/「Annotation」）。
 * - 测量/标注的「值」由本层计算（如 SI 单位距离），但不写回世界/解权威；
 *   只是 UI 投影态。invariant #13/#14：UI 不成为 BOQ/约束/世界权威。
 * - plan/section path 计算返回 renderer-neutral NavigationInput 或图层可见性
 *   序列，由宿主编排到 rendererSession.navigate/setVisibility。
 *
 * Babylon 渲染器 descriptor.capabilities.section === false（W004 冻结），
 * 故 section-cut 通过 plan-view navigation preset 实现（俯视 look-at + 高
 * 视角 + zoom out），并诚实记录能力边界。
 */
import type { Vec3 } from "@zcode/epoch-world-presentation";
import type { SolutionMeasurementPoint } from "@zcode/epoch-solution-contract";

/** 测量种类（闭合集合；未来扩展需契约变更）。 */
export const MEASUREMENT_KINDS = ["linear"] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

/**
 * 世界锚定的线性测量：from/to 均可锚定语义实体和/或世界坐标。
 * value 为 SI 单位（m）距离；displayValue 为格式化字符串（如 "3.42 m"）。
 * measurementId 由本层生成；稳定字符串。
 */
export interface WorldMeasurement {
  readonly measurementId: string;
  readonly kind: MeasurementKind;
  readonly from: SolutionMeasurementPoint;
  readonly to: SolutionMeasurementPoint;
  /** SI 单位距离（米）。 */
  readonly value: number;
  readonly displayValue: string;
  readonly createdAt: number;
}

/** 标注种类（闭合集合）。 */
export const ANNOTATION_KINDS = ["note"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/**
 * 世界锚定的标注：附着语义实体或稳定世界坐标；survives navigation
 * （锚定不变，渲染器只换投影）。annotationId 由本层生成。
 */
export interface WorldAnnotation {
  readonly annotationId: string;
  readonly kind: AnnotationKind;
  readonly text: string;
  readonly entityId?: string;
  readonly point?: Vec3;
  readonly createdAt: number;
}

/**
 * Plan-view 导航路径：返回 renderer-neutral 导航序列，宿主依序调
 * rendererSession.navigate 即可切到俯视正交风格视角。
 *
 * Babylon ArcRotateCamera 的 look-at + 高 position.y + 大 radius 近似俯视
 * 正交投影（descriptor.capabilities.plan === true；section === false）。
 */
export interface PlanViewNavigationPath {
  readonly kind: "plan-view";
  readonly target: Vec3;
  readonly position: Vec3;
  /** 推荐的 zoom factor（>1 拉远；<1 拉近）。 */
  readonly zoomFactor: number;
}

/**
 * Section cut 路径（capability boundary：Babylon 未实现 section-cut 几何解析，
 * 这里返回一个 layer-visibility 序列作为「视觉剖切」等价物——把某些图层
 * 隐藏以暴露内部元素。仍只走 renderer-neutral setVisibility）。
 */
export interface SectionCutPath {
  readonly kind: "section-cut";
  /** 推荐隐藏的图层 id（按剖切策略选择，如 ENVELOPE/MEP/FINISHES 隐藏以暴露 STRUCTURE）。 */
  readonly hiddenLayerIds: readonly string[];
  /** 推荐的 look-at 目标（剖切焦点）。 */
  readonly target: Vec3;
}

/** 交互层测量注册表：world-anchored 投影态权威（不写回世界/解权威）。 */
export interface MeasurementRegistry {
  /** 创建一个线性测量；返回新对象（id 稳定；value SI 米；displayValue 格式化）。 */
  createLinear(from: SolutionMeasurementPoint, to: SolutionMeasurementPoint): WorldMeasurement;
  /** 按 id 取测量；不存在返回 undefined。 */
  getById(measurementId: string): WorldMeasurement | undefined;
  /** 全部测量（顺序稳定：按 createdAt 升序）。 */
  list(): readonly WorldMeasurement[];
  /** 按 id 删除测量；返回是否删除。 */
  remove(measurementId: string): boolean;
  /** 清空（不影响世界权威）。 */
  clear(): void;
}

/** 交互层标注注册表：world-anchored 投影态权威。 */
export interface AnnotationRegistry {
  /** 创建一个标注；返回新对象（id 稳定）。 */
  createNote(text: string, anchor: { entityId?: string; point?: Vec3 }): WorldAnnotation | null;
  /** 按 id 取标注。 */
  getById(annotationId: string): WorldAnnotation | undefined;
  /** 全部标注（按 createdAt 升序）。 */
  list(): readonly WorldAnnotation[];
  /** 按 id 删除。 */
  remove(annotationId: string): boolean;
  /** 清空。 */
  clear(): void;
}

/** 交互层工厂：返回测量注册表 + 标注注册表 + plan/section path 计算器。 */
export interface WorldInteractionLayer {
  readonly measurements: MeasurementRegistry;
  readonly annotations: AnnotationRegistry;
  /**
   * 计算 plan-view 导航路径：以世界包围中心为目标，俯视高位 + 适度拉远。
   * 宿主依此调 rendererSession.navigate({kind:"look-at",...}) 即可。
   */
  computePlanViewPath(worldBounds: { center: Vec3; radius: number }): PlanViewNavigationPath;
  /**
   * 计算 section-cut 路径：返回推荐的隐藏图层 + look-at 目标。
   * capability boundary：Babylon 不支持几何剖切（descriptor.capabilities.section===false），
   * 这里以图层可见性序列作为视觉剖切的等价投影。
   */
  computeSectionCutPath(
    worldBounds: { center: Vec3; radius: number },
    options?: { readonly hiddenLayerIds?: readonly string[] },
  ): SectionCutPath;
}
