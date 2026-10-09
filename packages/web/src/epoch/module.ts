/**
 * web-epoch 模块清单：Web 端 Solution 宿主组合根。
 *
 * 依据 spec/work-orders/W005：Web 宿主在组合根注册构造 fixture 引擎与 Babylon
 * 渲染器，以零用户配置打开参考解；world-dominant 全幅世界画布承载 fixture，
 * 选择经渲染器交互映射解析到 Epoch entityId，图层控制切换 fixture 六层。
 *
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 * 消费 W001 冻结契约 + W002 fixture + W003 Solution Surface 控制器 + W004 Babylon
 * 适配器；本模块是宿主组合层，不引入新 surface 类型，不按 engineId 分支。
 */
export const webEpochModule = {
  id: "web-epoch",
  requires: [
    "epoch-world-model",
    "epoch-reconstruction-contract",
    "epoch-world-presentation",
    "epoch-renderer-contract",
    "epoch-solution-contract",
    "epoch-solution-surface",
    "epoch-construction-fixture",
    "epoch-renderer-babylon",
  ],
  provides: ["web-solution-host", "fixture-presentation-compiler"],
  publicEntrypoints: ["index.ts"],
} as const;
