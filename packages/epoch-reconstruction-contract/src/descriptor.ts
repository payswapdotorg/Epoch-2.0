/**
 * epoch-reconstruction-contract 引擎描述符。
 *
 * 依据 spec/architecture/contracts/reconstruction-engine.md「Descriptor」。
 * 引擎通过描述符声明身份、运行时隔离边界与能力；外部引擎输出在通过
 * 校验/归一化之前视为不可信能力输入（「Trust」）。
 */

/** 引擎运行时隔离边界（spec「Runtime isolation」）。 */
export const RECONSTRUCTION_RUNTIMES = ["in-process", "worker", "process", "remote"] as const;
export type ReconstructionRuntime = (typeof RECONSTRUCTION_RUNTIMES)[number];

/** 运行时校验集合。 */
export const RECONSTRUCTION_RUNTIME_SET: ReadonlySet<string> = new Set<string>(
  RECONSTRUCTION_RUNTIMES,
);

/** 运行时守卫。 */
export function isReconstructionRuntime(value: unknown): value is ReconstructionRuntime {
  return typeof value === "string" && RECONSTRUCTION_RUNTIME_SET.has(value);
}

/** 引擎能力声明（首版引擎可以只支持 open + snapshot + close）。 */
export interface ReconstructionEngineCapabilities {
  readonly open: boolean;
  readonly inspect: boolean;
  readonly mutate: boolean;
  readonly timeline: boolean;
  readonly variants: boolean;
  readonly measurements: boolean;
  readonly simulation: boolean;
}

/** 引擎能力守卫：七个能力开关都必须是布尔值。 */
export function isReconstructionEngineCapabilities(
  value: unknown,
): value is ReconstructionEngineCapabilities {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const keys = ["open", "inspect", "mutate", "timeline", "variants", "measurements", "simulation"];
  return keys.every((key) => typeof candidate[key] === "boolean");
}

/** 重建引擎描述符：注册到引擎注册表的唯一元数据来源。 */
export interface ReconstructionEngineDescriptor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly runtime: ReconstructionRuntime;
  /** 引擎可接受的输入种类（对应 ReconstructionInput 的 kind 值）。 */
  readonly inputKinds: readonly string[];
  readonly capabilities: ReconstructionEngineCapabilities;
}

/** 描述符守卫：必填字段齐全、runtime 合法、能力结构正确。 */
export function isReconstructionEngineDescriptor(
  value: unknown,
): value is ReconstructionEngineDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (typeof candidate.version !== "string" || candidate.version.length === 0) return false;
  if (!isReconstructionRuntime(candidate.runtime)) return false;
  if (
    !Array.isArray(candidate.inputKinds) ||
    !candidate.inputKinds.every((kind) => typeof kind === "string" && kind.length > 0)
  ) {
    return false;
  }
  if (!isReconstructionEngineCapabilities(candidate.capabilities)) return false;
  return true;
}
