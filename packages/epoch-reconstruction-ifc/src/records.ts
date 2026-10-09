/**
 * IFC 引擎私有记录类型（W009「Engine-specific data stays in the adapter」）。
 *
 * 依据 spec/architecture/contracts/reconstruction-engine.md「Input boundary」
 * 与 spec/architecture/ARCHITECTURE-LOCK.md invariant #4「World Model is
 * semantic authority」：原始 IFC 属性、GUID、关系等不属于世界模型词汇的
 * 数据留在 adapter 内部（这些类型不跨契约边界，不被 epoch-world-model
 * 的守卫或摘要覆盖）。只有契约形状的语义（WorldEntity/WorldRevision/
 * ProvenanceRef）跨边界。
 */

/**
 * 原始 IFC 实体记录：从 web-ifc 取出的、未经归一化的引擎私有数据。
 * - expressID：IFC 文件内的行号（#100 等），与 epoch entityId 不同。
 * - globalId：IFC GlobalId（22 字符 base64），IFC 跨文件稳定身份。
 * - ifcType：IFC 实体类型名（IfcSlab/IfcWall/...）。
 * - predefinedType：IFC PredefinedType 枚举（如 BASESLAB/DOOR）。
 * - name / description / objectType：IFC 标准字段（人类可读标签与分类）。
 * - rawPropertySets：IFC 属性集原始数据（PropertySet 名 -> 属性键值），
 *   仅记录引擎私有，不跨契约边界。
 */
export interface IfcRawEntity {
  readonly expressID: number;
  readonly globalId: string;
  readonly ifcType: string;
  readonly predefinedType: string | undefined;
  readonly name: string | undefined;
  readonly description: string | undefined;
  readonly objectType: string | undefined;
  readonly rawPropertySets: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * 原始 IFC 关系记录：IFC 显式关系实体（IfcRelContainedInSpatialStructure 等）。
 * 引擎私有——用于在归一化时派生 Epoch WorldRelationship，但其 IFC 原始
 * 字段（relatingRelating/to 等）不跨契约边界。
 */
export interface IfcRawRelationship {
  readonly expressID: number;
  readonly globalId: string;
  readonly ifcType: string;
  readonly name: string | undefined;
  /** 关系 relating 端的 expressID（集合拥有者等）。 */
  readonly relatingId: number | undefined;
  /** 关系 related 端的 expressID 列表（被包含者等）。 */
  readonly relatedIds: readonly number[];
}

/**
 * 原始 IFC 文件解析结果：引擎私有，open() 内部使用，归一化为 WorldRevision
 * 后即丢弃（不长期持有；snapshot() 返回的是归一化后的契约对象）。
 */
export interface IfcParseResult {
  readonly schema: string;
  readonly rawEntities: readonly IfcRawEntity[];
  readonly rawRelationships: readonly IfcRawRelationship[];
  /** 文件内容摘要（sha256，64 位小写 hex），用于 worldId 与溯源。 */
  readonly contentDigest: string;
}

/**
 * 单位映射结果：IFC IfcSIUnit 的枚举到 Epoch 冻结单位的映射证据。引擎私有——
 * 归一化时用，不跨边界（跨边界的是 QuantityValue 里的单位字符串）。
 */
export interface IfcUnitAssignment {
  readonly length: "m" | "cm" | "mm" | "km" | "in" | "ft" | "yd" | "mi" | undefined;
  readonly area: "m2" | "mm2" | "cm2" | "km2" | "ft2" | "in2" | undefined;
  readonly volume: "m3" | "mm3" | "cm3" | "L" | "ft3" | undefined;
}
