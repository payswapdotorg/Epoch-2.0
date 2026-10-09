/**
 * web-ifc 取值形状解开器（W009，引擎私有，配合 parser.ts / property-sets.ts）。
 *
 * web-ifc 取值形状（探针确认）：
 * - 字符串/标签/文本/GUID：{ value: string, type: 1, name: string } -> 取 .value。
 * - 枚举：{ type: 3, value: string } -> 取 .value。
 * - 引用（指向 expressID）：{ value: number, type: 5 } 或 null。
 * - 数字：{ value: number, type: 5 }（与引用同形，按字段语义解释）。
 */
interface IfcTypedValue {
  readonly value?: unknown;
  readonly type?: number;
  readonly name?: string;
}

/** 解开字符串值（IFCLABEL/IFCTEXT/IFCGLOBALLYUNIQUEID/枚举）。 */
export function unwrapString(field: unknown): string | undefined {
  if (field === null || field === undefined) return undefined;
  if (typeof field === "object" && field !== null) {
    const value = (field as IfcTypedValue).value;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** 解开引用值（指向 expressID 的整数）。 */
export function unwrapRef(field: unknown): number | undefined {
  if (field === null || field === undefined) return undefined;
  if (typeof field === "object" && field !== null) {
    const value = (field as IfcTypedValue).value;
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return undefined;
}

/** 解开引用列表（RelatedElements/HasProperties 等）。 */
export function unwrapRefList(field: unknown): readonly number[] {
  if (!Array.isArray(field)) return [];
  return field.map((item) => unwrapRef(item)).filter((id): id is number => typeof id === "number");
}

/**
 * 解析 IFC 数量值（web-ifc 0.0.78 怪癖：数值常落在 Formula.value 字符串里，
 * 直接 LengthValue/AreaValue/VolumeValue 字段为 type-only 占位）。
 * 优先取直接数值字段，回退 Formula.value 字符串解析。
 */
export function extractQuantityNumber(
  line: Record<string, unknown>,
  valueField: string,
): number | undefined {
  const direct = line[valueField];
  if (direct !== null && direct !== undefined && typeof direct === "object") {
    const directValue = (direct as IfcTypedValue).value;
    if (typeof directValue === "number" && Number.isFinite(directValue)) return directValue;
  }
  const formula = line.Formula;
  if (formula !== null && formula !== undefined && typeof formula === "object") {
    const formulaValue = (formula as IfcTypedValue).value;
    if (typeof formulaValue === "string" && formulaValue.length > 0) {
      const parsed = Number.parseFloat(formulaValue);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}
