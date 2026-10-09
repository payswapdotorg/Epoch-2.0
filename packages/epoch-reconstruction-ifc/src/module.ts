/**
 * epoch-reconstruction-ifc 模块清单：IFC 重建引擎适配器（W009）。
 *
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 * 消费 W001 冻结契约（epoch-world-model + epoch-reconstruction-contract）
 * 与 web-ifc（WASM IFC 解析器，npm 依赖——adapter 私有，不跨契约边界）。
 * 不引入 React/Babylon/Three 或任何渲染器/UI 运行时依赖；IFC 解析确定性
 * （相同字节恒产生相同 WorldRevision.digest，无网络/随机/时间依赖）。
 */
export const ifcReconstructionModule = {
  id: "epoch-reconstruction-ifc",
  requires: ["epoch-world-model", "epoch-reconstruction-contract"],
  provides: ["ifc-reconstruction-engine", "ifc-normalization"],
  publicEntrypoints: ["index.ts"],
} as const;
