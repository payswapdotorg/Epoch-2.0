/**
 * @zcode/epoch-solution-contract 公共入口。
 *
 * Solution Surface 契约（W001 冻结）：tab 身份、open/activate/close/
 * reopen/list 操作类型（幂等语义已冻结成文）、类型化交互意图
 * （solution.* 闭合联合，渲染器中立）与引擎元数据面。
 * 零运行时依赖；不含任何引擎实现类型。
 */
export * from "./contract.ts";
export { epochSolutionContractModule } from "./module.ts";
