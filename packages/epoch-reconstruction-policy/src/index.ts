/**
 * @zcode/epoch-reconstruction-policy 公共入口。
 *
 * W027 — 任务条件化重建策略：在不引入第二个世界权威的前提下，按任务/工种
 * 选择重建 detail 与证据充分性门。提供者中立（仅消费 epoch-world-model 的
 * ProvenanceRef 作为溯源引用；不导入任何引擎/渲染器实现类型）。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md 与
 * ARCHITECTURE-LOCK 不变量 4/7/9/10/16/21/22（世界模型为语义权威、引擎为能力、
 * 运行时隔离、无 provider 为权威、provider-neutral core、task-conditioned
 * fidelity、progressive refinement）。
 */
// 类型核心：intent / profile / evidence / inference provenance tag。
export type {
  WorkTypeId,
  FidelityLevel,
  InferenceProvenanceTag,
  EvidenceSourceKind,
  EvidenceProvenance,
  EvidenceDescriptor,
  ReconstructionIntent,
  ProfileInputRequirement,
  UncertaintyPolicy,
  ProfileOutputBounds,
  ReconstructionProfile,
} from "./contract.ts";
export {
  FIDELITY_LEVELS,
  FIDELITY_LEVEL_SET,
  isFidelityLevel,
  INFERENCE_PROVENANCE_TAGS,
  INFERENCE_PROVENANCE_TAG_SET,
  isInferenceProvenanceTag,
  isConfirmableProvenance,
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_SOURCE_KIND_SET,
  isEvidenceSourceKind,
  isEvidenceProvenance,
  isEvidenceDescriptor,
  isProfileInputRequirement,
  isUncertaintyPolicy,
  isProfileOutputBounds,
  isReconstructionProfile,
  isReconstructionIntent,
} from "./contract.ts";

// 适应度状态：READY / CONDITIONALLY_READY / BLOCKED / INFORMATION_REQUESTED +
// 证据缺口 + 信息请求 + sufficiency 评估结果。
export type {
  FitnessState,
  EvidenceGap,
  SatisfiedInput,
  InformationRequest,
  SufficiencyAssessment,
} from "./fitness.ts";
export {
  FITNESS_STATES,
  FITNESS_STATE_SET,
  isFitnessState,
  isEvidenceGap,
  isSatisfiedInput,
  isInformationRequest,
  isSufficiencyAssessment,
} from "./fitness.ts";

// 注册表与解析器。
export type { ProfileRegistry, ProfileResolution } from "./registry.ts";
export { createProfileRegistry, resolveProfile, isValidResolutionIntent } from "./registry.ts";

// 充分性评估器。
export { assessSufficiency } from "./sufficiency.ts";

// VOI 排序。
export { netVoI, rankInformationRequests, filterDecisionChanging } from "./voi.ts";

// 初始 profile 集。
export {
  FEASIBILITY_PROFILE,
  BOQ_PROFILE,
  CLASH_PROFILE,
  STRUCTURAL_PROFILE,
  SITE_VERIFICATION_PROFILE,
  INITIAL_PROFILES,
} from "./profiles.ts";

// 模块清单。
export { epochReconstructionPolicyModule } from "./module.ts";
