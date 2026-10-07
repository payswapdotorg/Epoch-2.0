/**
 * epoch-world-model 显式工程单位。
 *
 * 依据 spec/architecture/contracts/world-model.md「Units are explicit」：
 * 单位必须显式携带，内部归一化不得静默混合工程单位。这里冻结最小单位集与
 * 带单位的数量值对象；所有单位均为字符串字面量联合，运行时由
 * `UNIT_OF_MEASURE_SET` 提供校验依据（守卫用它拒绝非法单位）。
 */

/** 长度单位（默认契约单位为 m，其它单位必须显式声明）。 */
export const LENGTH_UNITS = ["m", "cm", "mm", "km", "in", "ft", "yd", "mi"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** 面积单位。 */
export const AREA_UNITS = ["m2", "mm2", "cm2", "km2", "ft2", "in2"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

/** 体积单位。 */
export const VOLUME_UNITS = ["m3", "mm3", "cm3", "L", "ft3"] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];

/** 质量单位。 */
export const MASS_UNITS = ["kg", "t", "g"] as const;
export type MassUnit = (typeof MASS_UNITS)[number];

/** 角度单位。 */
export const ANGLE_UNITS = ["deg", "rad"] as const;
export type AngleUnit = (typeof ANGLE_UNITS)[number];

/** 时间单位（timeline 语义坐标之外的物理时长）。 */
export const TIME_UNITS = ["s", "min", "h"] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];

/** 计数单位（BOQ 常用的件数/数量）。 */
export const COUNT_UNITS = ["count"] as const;
export type CountUnit = (typeof COUNT_UNITS)[number];

/** epoch-world-model 冻结的工程单位全集（闭合联合，扩展需走契约变更）。 */
export type UnitOfMeasure =
  | LengthUnit
  | AreaUnit
  | VolumeUnit
  | MassUnit
  | AngleUnit
  | TimeUnit
  | CountUnit;

/** 运行时单位校验集合：守卫用它拒绝「bad units」。 */
export const UNIT_OF_MEASURE_SET: ReadonlySet<string> = new Set<string>([
  ...LENGTH_UNITS,
  ...AREA_UNITS,
  ...VOLUME_UNITS,
  ...MASS_UNITS,
  ...ANGLE_UNITS,
  ...TIME_UNITS,
  ...COUNT_UNITS,
]);

/** 值必须为非空字符串且属于冻结单位集。 */
export function isUnitOfMeasure(value: unknown): value is UnitOfMeasure {
  return typeof value === "string" && value.length > 0 && UNIT_OF_MEASURE_SET.has(value);
}

/** 显式单位的数量值对象：值与单位不可分离。 */
export interface QuantityValue {
  readonly value: number;
  readonly unit: UnitOfMeasure;
}

/** 数量守卫：有限数值 + 冻结单位集中的单位。 */
export function isQuantityValue(value: unknown): value is QuantityValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { value?: unknown; unit?: unknown };
  return (
    typeof candidate.value === "number" &&
    Number.isFinite(candidate.value) &&
    isUnitOfMeasure(candidate.unit)
  );
}

/** 显式长度值。 */
export interface LengthValue {
  readonly value: number;
  readonly unit: LengthUnit;
}

/** 显式面积值。 */
export interface AreaValue {
  readonly value: number;
  readonly unit: AreaUnit;
}

/** 显式体积值。 */
export interface VolumeValue {
  readonly value: number;
  readonly unit: VolumeUnit;
}

/** 显式质量值。 */
export interface MassValue {
  readonly value: number;
  readonly unit: MassUnit;
}
