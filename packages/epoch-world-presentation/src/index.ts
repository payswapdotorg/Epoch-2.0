/**
 * @zcode/epoch-world-presentation 公共入口。
 *
 * 渲染器中立的表现投影契约（W001 冻结）：节点/变换/表现引用/交互绑定/
 * 投影模式（开放枚举）/可移植渲染器切换状态/编译类型。
 * 零运行时依赖；不含 Babylon/Three 或任何渲染器实现类型。
 */
export * from "./contract.ts";
export { epochWorldPresentationModule } from "./module.ts";
