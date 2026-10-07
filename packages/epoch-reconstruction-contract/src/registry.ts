/**
 * epoch-reconstruction-contract 引擎注册表。
 *
 * 依据 spec/architecture/contracts/reconstruction-engine.md「Registry」：
 * 注册表是 solution-opening UI 与 agent tools 的唯一引擎发现路径。
 * 这里提供纯内存注册表工厂（无引擎知识、无发现机制——发现属后续工单），
 * 供契约测试与宿主组装使用。
 */
import type { ReconstructionEngine } from "./engine.ts";
import { isWellFormedReconstructionEngine } from "./engine.ts";
import type { ReconstructionEngineDescriptor } from "./descriptor.ts";

/** 引擎注册表契约。 */
export interface ReconstructionEngineRegistry {
  /**
   * 注册引擎。描述符必须合法（不合法抛错）；重复 id 视为编程错误，
   * 后注册覆盖先注册并保持注册顺序不变（幂等重装同一引擎实例安全）。
   */
  register(engine: ReconstructionEngine): void;
  /** 按 id 解析引擎；未知 id 抛错（UI 不得以静默降级绕过注册表）。 */
  get(id: string): ReconstructionEngine;
  /** 已注册引擎的描述符列表（按注册顺序）。 */
  list(): readonly ReconstructionEngineDescriptor[];
}

/**
 * 纯内存注册表工厂：engine-agnostic、无副作用、无发现逻辑。
 * list() 返回内部快照（只读数组），外部不可经由返回值篡改注册状态。
 */
export function createReconstructionEngineRegistry(): ReconstructionEngineRegistry {
  const engines = new Map<string, ReconstructionEngine>();
  const order: string[] = [];
  return {
    register(engine: ReconstructionEngine): void {
      if (!isWellFormedReconstructionEngine(engine)) {
        throw new TypeError("register() expects a well-formed ReconstructionEngine");
      }
      const descriptor = engine.descriptor();
      if (!engines.has(descriptor.id)) order.push(descriptor.id);
      engines.set(descriptor.id, engine);
    },
    get(id: string): ReconstructionEngine {
      const engine = engines.get(id);
      if (engine === undefined) {
        throw new Error(`reconstruction engine not registered: ${id}`);
      }
      return engine;
    },
    list(): readonly ReconstructionEngineDescriptor[] {
      return order
        .map((id) => engines.get(id)?.descriptor())
        .filter((descriptor): descriptor is ReconstructionEngineDescriptor => descriptor !== null);
    },
  };
}
