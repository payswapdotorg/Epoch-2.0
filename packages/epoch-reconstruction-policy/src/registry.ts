/**
 * epoch-reconstruction-policy 注册表与解析器。
 *
 * 依据 spec/work-orders/W027-task-conditioned-reconstruction.md「Registry +
 * resolution」与验收点 6：
 *
 * - ProfileRegistry：纯内存注册表（engine-agnostic、无副作用、无发现逻辑）。
 *   新增 profile 不触碰渲染器/世界模型代码（验收点 6）。
 * - resolveProfile(intent)：精确匹配（workType + supportedFidelities 包含
 *   requestedFidelity）→ 最近用途 fallback（同 workType 不同 fidelity 的
 *   profile）→ 诚实 MISS（无匹配时返回明确的 MISS，不静默降级）。
 *
 * 解析器不写回世界状态（不变量 4/14）：profile 是 sufficiency 要求与细化计划，
 * 不是第二个世界。
 */
import type { ReconstructionIntent, ReconstructionProfile, FidelityLevel } from "./contract.ts";
import { isReconstructionProfile, isFidelityLevel } from "./contract.ts";

/** 解析结果：要么匹配（含是否为 fallback），要么诚实 MISS。 */
export type ProfileResolution =
  | {
      readonly status: "matched";
      readonly profile: ReconstructionProfile;
      readonly fallback: false;
    }
  | {
      readonly status: "fallback";
      readonly profile: ReconstructionProfile;
      readonly fallback: true;
      readonly reason: string;
    }
  | {
      readonly status: "miss";
      readonly reason: string;
    };

/** Profile 注册表契约。 */
export interface ProfileRegistry {
  /**
   * 注册 profile。结构非法抛 TypeError；重复 id 视为编程错误，
   * 后注册覆盖先注册并保持注册顺序不变（幂等重装同实例安全）。
   */
  register(profile: ReconstructionProfile): void;
  /** 按 id 解析 profile；未知 id 抛错。 */
  get(id: string): ReconstructionProfile;
  /** 已注册 profile 列表（按注册顺序）。 */
  list(): readonly ReconstructionProfile[];
  /** 列出给定 workType 的所有 profile（按注册顺序）。 */
  listByWorkType(workType: string): readonly ReconstructionProfile[];
}

/** 纯内存注册表工厂。 */
export function createProfileRegistry(): ProfileRegistry {
  const profiles = new Map<string, ReconstructionProfile>();
  const order: string[] = [];
  return {
    register(profile: ReconstructionProfile): void {
      if (!isReconstructionProfile(profile)) {
        throw new TypeError("register() expects a well-formed ReconstructionProfile");
      }
      if (!profiles.has(profile.id)) order.push(profile.id);
      profiles.set(profile.id, profile);
    },
    get(id: string): ReconstructionProfile {
      const profile = profiles.get(id);
      if (profile === undefined) {
        throw new Error(`reconstruction profile not registered: ${id}`);
      }
      return profile;
    },
    list(): readonly ReconstructionProfile[] {
      return order
        .map((id) => profiles.get(id))
        .filter((p): p is ReconstructionProfile => p !== undefined);
    },
    listByWorkType(workType: string): readonly ReconstructionProfile[] {
      return order
        .map((id) => profiles.get(id))
        .filter((p): p is ReconstructionProfile => p !== undefined && p.workType === workType);
    },
  };
}

/** fidelity 等级序值（用于 fallback 时选「最近但不过分」的 profile）。 */
const FIDELITY_RANK: Readonly<Record<FidelityLevel, number>> = {
  exploratory: 0,
  conceptual: 1,
  measurable: 2,
  coordination: 3,
  analytical: 4,
};

/**
 * 解析 intent 到 profile。
 *
 * 1. 精确匹配：workType 完全相等，且 supportedFidelities 包含 requestedFidelity。
 * 2. 最近用途 fallback：workType 相等但 fidelity 不在 supportedFidelities 内时，
 *    选 fidelity 距离最近的同 workType profile（偏向「不过分高于请求」的，
 *    即 rank 不超过请求 +1 的最近者；若无则取最近的低于请求者）。
 * 3. 诚实 MISS：无任何同 workType profile 时返回 miss（不静默选不相关 profile）。
 */
export function resolveProfile(
  registry: ProfileRegistry,
  intent: ReconstructionIntent,
): ProfileResolution {
  const candidates = registry.listByWorkType(intent.workType);
  if (candidates.length === 0) {
    return {
      status: "miss",
      reason: `no profile registered for workType "${intent.workType}"`,
    };
  }
  // 1. 精确匹配
  const exact = candidates.find((p) => p.supportedFidelities.includes(intent.requestedFidelity));
  if (exact !== undefined) {
    return { status: "matched", profile: exact, fallback: false };
  }
  // 2. 最近用途 fallback
  const requestRank = FIDELITY_RANK[intent.requestedFidelity] ?? 0;
  // 偏向「不过分高于请求」：优先选 rank <= requestRank+1 中最大的；否则选低于请求的最大的
  const within = candidates
    .filter(
      (p) =>
        Math.max(...p.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)) <= requestRank + 1,
    )
    .sort(
      (a, b) =>
        Math.max(...b.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)) -
        Math.max(...a.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)),
    );
  if (within.length > 0) {
    const withinProfile = within[0];
    if (withinProfile === undefined) {
      return {
        status: "miss",
        reason: `internal: within[0] undefined for workType "${intent.workType}"`,
      };
    }
    return {
      status: "fallback",
      profile: withinProfile,
      fallback: true,
      reason: `no profile for workType "${intent.workType}" at fidelity "${intent.requestedFidelity}"; selected nearest-purpose profile "${withinProfile.id}"`,
    };
  }
  // 否则选低于请求的最大的
  const below = candidates
    .filter(
      (p) => Math.max(...p.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)) <= requestRank,
    )
    .sort(
      (a, b) =>
        Math.max(...b.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)) -
        Math.max(...a.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)),
    );
  if (below.length > 0) {
    const belowProfile = below[0];
    if (belowProfile === undefined) {
      return {
        status: "miss",
        reason: `internal: below[0] undefined for workType "${intent.workType}"`,
      };
    }
    return {
      status: "fallback",
      profile: belowProfile,
      fallback: true,
      reason: `no profile for workType "${intent.workType}" at fidelity "${intent.requestedFidelity}"; selected lower-fidelity profile "${belowProfile.id}"`,
    };
  }
  // 所有候选都高于请求：取最低的（最少越权）
  const lowest = [...candidates].sort(
    (a, b) =>
      Math.min(...a.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)) -
      Math.min(...b.supportedFidelities.map((f) => FIDELITY_RANK[f] ?? 0)),
  );
  const lowestProfile = lowest[0];
  if (lowestProfile === undefined) {
    return {
      status: "miss",
      reason: `internal: lowest[0] undefined for workType "${intent.workType}"`,
    };
  }
  return {
    status: "fallback",
    profile: lowestProfile,
    fallback: true,
    reason: `no profile for workType "${intent.workType}" at fidelity "${intent.requestedFidelity}"; selected lowest-available profile "${lowestProfile.id}" (above request)`,
  };
}

/** 解析守卫：intent 合法性快速校验（用于 resolver 入口）。 */
export function isValidResolutionIntent(intent: unknown): intent is ReconstructionIntent {
  if (typeof intent !== "object" || intent === null) return false;
  const candidate = intent as Record<string, unknown>;
  if (typeof candidate.workType !== "string" || candidate.workType.length === 0) return false;
  if (!isFidelityLevel(candidate.requestedFidelity)) return false;
  return true;
}
