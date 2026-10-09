/**
 * epoch-construction-fixture 模块清单：确定性构造 fixture 重建引擎。
 *
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 * 消费 W001 冻结契约（epoch-world-model + epoch-reconstruction-contract），
 * 不引入任何引擎/UI 运行时依赖；零网络、零随机、零时间依赖（内容路径）。
 */
export const constructionFixtureModule = {
  id: "epoch-construction-fixture",
  requires: ["epoch-world-model", "epoch-reconstruction-contract"],
  provides: ["construction-fixture-engine", "construction-fixture-content"],
  publicEntrypoints: ["index.ts"],
} as const;
