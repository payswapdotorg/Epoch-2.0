/**
 * @zcode/epoch-world-model 公共入口。
 *
 * 工程语义世界的提供者中立契约（W001 冻结）：
 * 实体、关系、世界修订、溯源、显式单位与确定性摘要。
 * 零运行时依赖；不引入 React/Babylon/Three 或任何引擎类型。
 */
export * from "./contract.ts";
export { epochWorldModelModule } from "./module.ts";
