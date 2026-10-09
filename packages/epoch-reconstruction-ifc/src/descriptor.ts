/**
 * IFC 重建引擎描述符与确定性溯源常量（W009「Provenance」）。
 *
 * 依据 spec/architecture/contracts/reconstruction-engine.md「Descriptor」与
 * world-model.md「Provenance」：IFC 来源为非 fixture 重建来源，必须可追溯至
 * 来源工件/引擎/版本。引擎身份、版本、世界身份、内容引用均为字面量（确定性），
 * 保证 open() 幂等且摘要可复现。来源文件名参与溯源 artifact 字段（每次 open
 * 随输入变化），但不参与摘要（摘要只覆盖规范语义字段）。
 */
import type { ReconstructionEngineDescriptor } from "@zcode/epoch-reconstruction-contract";

/** 引擎身份（注册表唯一键）。 */
export const IFC_RECONSTRUCTION_ENGINE_ID = "epoch.reconstruction-ifc";
/** 引擎版本（语义化）。 */
export const IFC_RECONSTRUCTION_ENGINE_VERSION = "0.1.0";
/** 引擎人类可读名称。 */
export const IFC_RECONSTRUCTION_ENGINE_NAME = "Epoch IFC Reconstruction Engine";

/**
 * 世界身份前缀：IFC 文件按来源工件区分世界身份。worldId 由
 * `epoch-ifc-world:<source-artifact>:<content-digest-12>` 构成——同一文件
 * 内容恒映射到同一 worldId（跨修订稳定），不同文件产生不同 worldId。
 * 内容摘要取自 IFC 文件内容的 sha256 前 12 位（open 时计算一次）。
 */
export const IFC_RECONSTRUCTION_WORLD_ID_PREFIX = "epoch-ifc-world";

/**
 * 引擎接受的输入种类：file-path（本地 IFC 文件）与 byte-reference（已加载的
 * IFC 字节引用，由宿主解析）。IFC 不接受 engine-native（IFC 是开放格式）。
 */
export const IFC_RECONSTRUCTION_INPUT_KINDS = ["file-path", "byte-reference"] as const;

/**
 * 引擎能力声明：open/inspect/measurements 为真；mutate/timeline/variants/
 * simulation 为假（W009 只读 + 快照，不写回世界状态——invariant #4「No
 * second semantic authority」）。
 */
export const IFC_RECONSTRUCTION_CAPABILITIES = {
  open: true,
  inspect: true,
  mutate: false,
  timeline: false,
  variants: false,
  measurements: true,
  simulation: false,
} as const;

/**
 * 引擎描述符（冻结字面量，每次 descriptor() 返回同一引用）。
 *
 * runtime=in-process：web-ifc 以 WASM 形式加载进 Node 进程解析 IFC，不
 * 跨进程、不跨网络。这与 W002 fixture 引擎的 runtime 分类一致，且符合
 * spec「Runtime isolation」中 IFC 可走 process/worker 边界的说明——本实现
 * 选择 in-process 的 WASM 边界（无外部 Python/进程依赖，确定且可复现）。
 */
export const IFC_RECONSTRUCTION_DESCRIPTOR: ReconstructionEngineDescriptor = {
  id: IFC_RECONSTRUCTION_ENGINE_ID,
  name: IFC_RECONSTRUCTION_ENGINE_NAME,
  version: IFC_RECONSTRUCTION_ENGINE_VERSION,
  runtime: "in-process",
  inputKinds: [...IFC_RECONSTRUCTION_INPUT_KINDS],
  capabilities: IFC_RECONSTRUCTION_CAPABILITIES,
};

/**
 * 构造 IFC 来源的修订级溯源引用。
 *
 * - kind: "file"（来源工件为文件）或 "engine"（产生内容的引擎）。
 * - sourceId: 来源工件标识（文件路径或 byte 引用）。
 * - artifact: 来源工件的可寻址引用（与 sourceId 同值，便于溯源检索）。
 * - engineId / engineVersion: 产生该内容的引擎与版本（确定性字面量）。
 * - digest: 来源 IFC 文件的内容摘要（sha256，64 位小写 hex；open 时计算）。
 *
 * 溯源参与世界摘要（provenance 在规范字段内），故内容确定时溯源亦确定。
 * 同一文件多次 open 产生相同 digest -> 相同溯源 -> 相同摘要。
 */
export function ifcFileProvenanceRef(args: {
  readonly sourceId: string;
  readonly artifact: string;
  readonly digest: string;
}): {
  readonly sourceId: string;
  readonly kind: "file";
  readonly artifact: string;
  readonly engineId: string;
  readonly engineVersion: string;
  readonly digest: string;
} {
  return {
    sourceId: args.sourceId,
    kind: "file" as const,
    artifact: args.artifact,
    engineId: IFC_RECONSTRUCTION_ENGINE_ID,
    engineVersion: IFC_RECONSTRUCTION_ENGINE_VERSION,
    digest: args.digest,
  };
}

/**
 * 构造 IFC 世界身份：内容寻址，跨修订稳定。
 * 形如 `epoch-ifc-world:ifc/sample.ifc:abc123def456`（前缀:artifact:digest12）。
 */
export function buildIfcWorldId(artifact: string, contentDigest: string): string {
  return `${IFC_RECONSTRUCTION_WORLD_ID_PREFIX}:${artifact}:${contentDigest.slice(0, 12)}`;
}
