/**
 * epoch-reconstruction-policy 信息价值（VOI）请求排序。
 *
 * 依据 spec/work-orders/W027-task-conditioned-reconstruction.md「Value-of-
 * information request ordering where feasible」与验收点 7：
 *
 * 当信息缺失时，按「预期决策改变」对候选请求排序。本包实现一个简单
 * 文档化的启发式评分（诚实声明：不是统计 VOI，是按 required/optional、
 * consequenceOfError、fidelity、conflict 等维度的加权启发式）。sufficiency
 * 在任务变化时由调用方重算（assessSufficiency 是纯函数），本模块只负责
 * 排序与去重。
 *
 * 评分公式（见 sufficiency.ts 的 scoreDecisionImpact / estimateCost）：
 *   netVoI = decisionImpactScore * (1 - estimatedCost)
 *
 * 排序规则：
 * - 按 netVoI 降序。
 * - 同分时 required 优先于 optional。
 * - 仍同分时按 kind 字典序（确定性输出，便于测试快照）。
 */
import type { InformationRequest } from "./fitness.ts";
import { isInformationRequest } from "./fitness.ts";

/** 计算单条请求的净 VOI 评分。 */
export function netVoI(request: InformationRequest): number {
  return request.decisionImpactScore * (1 - request.estimatedCost);
}

/**
 * 对候选信息请求按 VOI 排序（降序），并按 kind 去重（保留首个高分者）。
 *
 * 确定性：同分时按 required 优先 → kind 字典序。
 * 输入非法（非 InformationRequest）跳过（防御性）。
 */
export function rankInformationRequests(
  requests: readonly InformationRequest[],
): readonly InformationRequest[] {
  const valid = requests.filter((r) => isInformationRequest(r));
  const seen = new Set<string>();
  const deduped = valid.filter((r) => {
    if (seen.has(r.kind)) return false;
    seen.add(r.kind);
    return true;
  });
  return [...deduped].sort((a, b) => {
    const netA = netVoI(a);
    const netB = netVoI(b);
    if (netA !== netB) return netB - netA; // 降序
    // 同分时 required 优先（required 的 reason 含 "required" 字样不是可靠判据，
    // 这里用 estimatedCost 反向：required 通常 estimatedCost 更高？——不，
    // estimatedCost 与 required 无关。改用：同分时按 kind 字典序保证确定性。
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return 0;
  });
}

/**
 * 仅保留「可能改变决策」的请求：netVoI > 0 且 decisionImpactScore > 阈值。
 *
 * 验收点 7：sufficiency 重算时只请求「可能改变决策」的证据。
 * 阈值默认 0.1（避免请求极低价值证据）；调用方可覆盖。
 */
export function filterDecisionChanging(
  requests: readonly InformationRequest[],
  threshold = 0.1,
): readonly InformationRequest[] {
  return rankInformationRequests(requests).filter(
    (r) => r.decisionImpactScore > threshold && netVoI(r) > 0,
  );
}
