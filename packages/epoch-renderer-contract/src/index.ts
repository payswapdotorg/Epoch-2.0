/**
 * @zcode/epoch-renderer-contract 公共入口。
 *
 * 交互式渲染器适配器契约（W001 冻结）：Babylon/Three/未来渲染器的
 * 唯一稳定接入面。零运行时依赖；不含 Babylon/Three 类型。
 */
export * from "./contract.ts";
export { epochRendererContractModule } from "./module.ts";
