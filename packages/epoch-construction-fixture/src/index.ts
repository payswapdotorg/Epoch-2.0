/**
 * @zcode/epoch-construction-fixture 公共入口。
 *
 * 确定性构造 fixture 重建引擎（W002）：实现冻结的 ReconstructionEngine 契约，
 * 产出六层（SITE/FOUNDATION/STRUCTURE/ENVELOPE/MEP/FINISHES）构造世界修订。
 * 零网络、零随机、零时间依赖（内容路径）；相同输入恒产生相同摘要。
 */
export * from "./contract.ts";
export { constructionFixtureModule } from "./module.ts";
