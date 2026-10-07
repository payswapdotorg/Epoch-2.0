/**
 * @zcode/epoch-reconstruction-contract 公共入口。
 *
 * 重建引擎能力契约（W001 冻结）：描述符、输入分类、上下文、
 * 引擎/会话接口与纯内存注册表工厂。零运行时依赖；不含任何
 * 引擎实现类型（IFC/Blender 等属适配器包）。
 */
export * from "./contract.ts";
export { epochReconstructionContractModule } from "./module.ts";
