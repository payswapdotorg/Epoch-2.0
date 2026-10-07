/**
 * epoch-reconstruction-contract 引擎与会话接口。
 *
 * 依据 spec/architecture/contracts/reconstruction-engine.md「Engine interface」：
 * 首版引擎可以只支持 open + snapshot + close；apply/subscribe 为可选能力。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import type { ReconstructionEngineDescriptor } from "./descriptor.ts";
import { isReconstructionEngineDescriptor } from "./descriptor.ts";
import type { ReconstructionInput } from "./input.ts";
import type { ReconstructionContext } from "./context.ts";
import type { ReconstructionOperation, ReconstructionEvent } from "./events.ts";

/**
 * 重建会话：一次 open 的存续期。会话不是全局生命周期所有者
 * （authority-map：会话属 Engine Fabric，不拥有全局生命周期）。
 */
export interface ReconstructionSession {
  /** 当前世界快照（归一化后必须 schema 合法并携带溯源）。 */
  snapshot(): Promise<WorldRevision>;
  /** 可选：应用变更操作并返回新修订。 */
  apply?(operation: ReconstructionOperation): Promise<WorldRevision>;
  /** 可选：订阅会话事件；返回取消订阅函数。 */
  subscribe?(listener: (event: ReconstructionEvent) => void): () => void;
  /** 释放会话资源（幂等释放由实现保证）。 */
  close(): Promise<void>;
}

/** 重建引擎能力接口：一切引擎接入的唯一稳定入口。 */
export interface ReconstructionEngine {
  descriptor(): ReconstructionEngineDescriptor;
  open(input: ReconstructionInput, context: ReconstructionContext): Promise<ReconstructionSession>;
}

/** 引擎守卫：descriptor/open 为必需的函数成员。 */
export function isReconstructionEngine(value: unknown): value is ReconstructionEngine {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.descriptor !== "function") return false;
  if (typeof candidate.open !== "function") return false;
  return true;
}

/** 复合守卫：结构合法且 descriptor() 返回合法描述符（异常视为不合法）。 */
export function isWellFormedReconstructionEngine(value: unknown): value is ReconstructionEngine {
  if (!isReconstructionEngine(value)) return false;
  try {
    return isReconstructionEngineDescriptor(value.descriptor());
  } catch {
    return false;
  }
}
