/**
 * epoch-reconstruction-policy 保真度等级。
 *
 * 任务侧请求的输出精度与证据要求。等级本身不是「越高越好」；profile 据此
 * 决定强制门与可选门（spec/architecture/contracts/task-conditioned-
 * reconstruction.md「Intent and profile」）。
 */
export const FIDELITY_LEVELS = [
  "exploratory",
  "conceptual",
  "measurable",
  "coordination",
  "analytical",
] as const;
export type FidelityLevel = (typeof FIDELITY_LEVELS)[number];

export const FIDELITY_LEVEL_SET: ReadonlySet<string> = new Set<string>(FIDELITY_LEVELS);

export function isFidelityLevel(value: unknown): value is FidelityLevel {
  return typeof value === "string" && FIDELITY_LEVEL_SET.has(value);
}
