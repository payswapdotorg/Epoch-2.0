/**
 * epoch-reconstruction-policy 公共契约：任务条件化重建的提供者中立类型核心。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md「Intent and
 * profile」与 ARCHITECTURE-LOCK 不变量 4/7/9/10/16（世界模型为语义权威、引擎为
 * 能力、运行时隔离、无 provider 为权威、provider-neutral core）：
 *
 * - ReconstructionIntent：声明任务/工种/目标范围/请求保真度——任务侧的输入。
 * - ReconstructionProfile：声明该工种所需输入、可选输入、不确定性策略、输出边界
 *   与强制阻塞门——能力侧的配置（不是第二个世界）。
 * - EvidenceDescriptor / EvidenceProvenance / InferenceProvenanceTag：证据与
 *   推断溯源，保证「推断/默认几何永不被静默提升为确认事实」（验收点 8）。
 *
 * 本文件是公共契约的聚合入口（再导出）；具体类型与守卫分布在 fidelity.ts /
 * evidence.ts / intent.ts / profile.ts，以遵守 architecture-policy.yaml 的
 * maxContractLines 上限。不引入任何引擎/渲染器/世界权威实现类型；只消费
 * epoch-world-model 的 ProvenanceRef（语义溯源引用，W001 冻结）。
 */
export type { WorkTypeId } from "./evidence.ts";
export type {
  InferenceProvenanceTag,
  EvidenceSourceKind,
  EvidenceProvenance,
  EvidenceDescriptor,
} from "./evidence.ts";
export {
  INFERENCE_PROVENANCE_TAGS,
  INFERENCE_PROVENANCE_TAG_SET,
  isInferenceProvenanceTag,
  isConfirmableProvenance,
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_SOURCE_KIND_SET,
  isEvidenceSourceKind,
  isEvidenceProvenance,
  isEvidenceDescriptor,
} from "./evidence.ts";

export type { FidelityLevel } from "./fidelity.ts";
export { FIDELITY_LEVELS, FIDELITY_LEVEL_SET, isFidelityLevel } from "./fidelity.ts";

export type { ReconstructionIntent } from "./intent.ts";
export { isReconstructionIntent } from "./intent.ts";

export type {
  ProfileInputRequirement,
  UncertaintyPolicy,
  ProfileOutputBounds,
  ReconstructionProfile,
} from "./profile.ts";
export {
  isProfileInputRequirement,
  isUncertaintyPolicy,
  isProfileOutputBounds,
  isReconstructionProfile,
} from "./profile.ts";
