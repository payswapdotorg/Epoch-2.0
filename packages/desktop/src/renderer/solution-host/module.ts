/**
 * desktop-solution-host 模块清单：Desktop 端 Solution 宿主组合根（renderer 进程）。
 *
 * 依据 spec/work-orders/W006 + W007：Electron renderer 在组合根注册构造 fixture
 * 引擎与 Babylon 渲染器，以零用户配置打开参考解；世界画布承载 fixture，选择经
 * 渲染器交互映射解析到 Epoch entityId。W007 在同一宿主上叠加 section/plan、
 * measurement、isolate 与投影 inspector（epoch-solution-runtime / epoch-world-interaction）。
 *
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 DesktopSolutionHost.tsx。
 * 本模块是宿主组合层：不引入新 surface 类型，不按 engineId 分支，不深引用
 * epoch-* 内部文件（ARCHITECTURE-LOCK #2/#8/#16）。
 */
export const desktopSolutionHostModule = {
  id: "desktop-solution-host",
  requires: [
    "epoch-solution-surface",
    "epoch-renderer-babylon",
    "epoch-construction-fixture",
    "epoch-renderer-contract",
    "epoch-reconstruction-contract",
    "epoch-world-presentation",
    "epoch-world-model",
  ],
  provides: ["desktop-solution-host"],
  publicEntrypoints: ["DesktopSolutionHost.tsx"],
} as const;
