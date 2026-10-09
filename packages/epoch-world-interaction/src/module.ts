/**
 * epoch-world-interaction 模块清单：交互层（plan/section path + measurement + annotation）。
 *
 * W007 边界法：消费冻结契约（world-presentation、solution-contract、world-model），
 * 不导入任何引擎/渲染器实现类型。不按 engineId 分支；不新增 surface 类型
 * （ARCHITECTURE-LOCK #2/#8）。测量/标注是投影态，不写回世界/解权威
 * （invariant #13/#14）。依赖声明与 architecture-policy.yaml 的
 * epoch-world-interaction 条目保持一致。
 */
export const epochWorldInteractionModule = {
  id: "epoch-world-interaction",
  requires: ["epoch-world-presentation", "epoch-solution-contract", "epoch-world-model"],
  provides: ["world-interaction-layer"],
  publicEntrypoints: ["index.ts"],
} as const;
