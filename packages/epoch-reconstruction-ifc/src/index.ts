/**
 * @zcode/epoch-reconstruction-ifc 公共入口。
 *
 * IFC 重建引擎适配器（W009）：实现冻结的 ReconstructionEngine 契约，
 * 将真实 IFC 文件归一化为 WorldRevision（稳定 entityId/entityType/label、
 * 显式 SI 单位的 quantities/dimensions、IFC->Epoch 图层映射、修订级溯源）。
 *
 * 解析策略：web-ifc（WASM，npm-installable）——IfcOpenShell Python 在本环境
 * 不可用（见报告「IfcOpenShell reality check」），web-ifc 为 work-order
 * sanctioned fallback。runtime=in-process（WASM 加载进 Node 进程）。
 *
 * 确定性：相同 IFC 文件字节恒产生相同 WorldRevision.digest（web-ifc 解析
 * 确定性 + 文件内容 sha256 摘要确定性 + 冻结 computeWorldDigest）。
 * 引擎私有原始数据（GUID/属性集/关系）不跨契约边界——只产出契约形状的
 * WorldEntity/WorldRelationship/ProvenanceRef。不写回世界状态（invariant #4）。
 */
export * from "./contract.ts";
export { ifcReconstructionModule } from "./module.ts";
