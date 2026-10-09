/**
 * IFC 重建引擎（W009 交付物）。
 *
 * 实现 @zcode/epoch-reconstruction-contract 冻结的 ReconstructionEngine：
 * descriptor() + open() + ReconstructionSession(snapshot + close)。
 *
 * 运行时分类：in-process（web-ifc WASM 加载进 Node 进程解析 IFC；见
 * descriptor.ts 与 spec「Runtime isolation」——IFC 可走 process/worker 边界，
 * 本实现选择 in-process 的 WASM 边界：无外部 Python/进程依赖，确定且可复现）。
 *
 * 确定性保证（W009「Determinism」）：相同 IFC 文件字节恒产生相同
 * IfcParseResult（web-ifc 解析确定性 + 文件内容 sha256 摘要确定性）->
 * 相同归一化 WorldEntity/WorldRelationship/ProvenanceRef -> 相同
 * computeWorldDigest（冻结 sha256 规范）。无网络、无 Math.random、无
 * Date.now()。revisionId 与 presentationSeed 由内容摘要派生（确定性）。
 *
 * 不写回世界状态（invariant #4「No second semantic authority」）：open 是
 * 生产 WorldRevision 的能力，snapshot 返回不可变快照；无 apply（mutate=false）。
 */
import { readFile } from "node:fs/promises";
import type {
  ReconstructionEngine,
  ReconstructionSession,
  ReconstructionInput,
  ReconstructionContext,
} from "@zcode/epoch-reconstruction-contract";
import type { WorldRevision, WorldEntity, WorldRelationship } from "@zcode/epoch-world-model";
import { computeWorldDigest } from "@zcode/epoch-world-model";
import type { IfcParseResult, IfcUnitAssignment } from "./records.ts";
import { parseIfc, readIfcUnitAssignment } from "./parser.ts";
import { normalizeIfcParseResult } from "./normalization.ts";
import {
  IFC_RECONSTRUCTION_DESCRIPTOR,
  IFC_RECONSTRUCTION_ENGINE_ID,
  buildIfcWorldId,
} from "./descriptor.ts";

/** 从 ReconstructionInput 解析出 (字节, sourceArtifact)。 */
async function resolveInputBytes(input: ReconstructionInput): Promise<{
  readonly bytes: Uint8Array;
  readonly sourceArtifact: string;
}> {
  if (input.kind === "file-path") {
    const buffer = await readFile(input.path);
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return { bytes, sourceArtifact: input.path };
  }
  if (input.kind === "byte-reference") {
    // byte-reference 的 reference 是宿主解析出的字节引用标识；本引擎要求
    // 宿主在 context 中不内联大载荷，故此处将 reference 视为「需宿主预加载」。
    // W009 minimal 实现：byte-reference 的 reference 必须是可直接 readFile 的路径
    // （宿主负责把字节引用解析为本地路径）。这与 spec「Input boundary」一致：
    // byte-reference 指向进程内或存储中的字节/对象（不内联大载荷）。
    const buffer = await readFile(input.reference);
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return { bytes, sourceArtifact: input.reference };
  }
  throw new TypeError(
    `IFC engine rejects input kind: ${input.kind} (expected file-path or byte-reference)`,
  );
}

/** 检查 engineId 匹配（仅 engine-native 输入需要；IFC 用 file/byte-reference）。 */
function assertNotEngineNative(input: ReconstructionInput): void {
  if (input.kind === "engine-native") {
    // IFC 是开放格式，不接受 engine-native（避免引擎原生值泄漏进共享契约）。
    if (input.engineId === IFC_RECONSTRUCTION_ENGINE_ID) {
      throw new TypeError(
        "IFC engine rejects engine-native input: use file-path or byte-reference",
      );
    }
    // 其它 engineId 的 engine-native 不应路由到本引擎。
    throw new TypeError(`IFC engine rejects mismatched engineId: ${input.engineId}`);
  }
}

/**
 * 构造 IFC 文件的 WorldRevision（确定性摘要 + 确定性 revisionId/seed）。
 *
 * - worldId：内容寻址（epoch-ifc-world:<artifact>:<digest12>），跨修订稳定。
 * - revisionId：由内容摘要派生（rev-ifc:<digest12>），同一文件恒定。
 * - presentationSeed：由 worldId 派生（确定性投影种子，非语义内容）。
 * - digest：冻结 computeWorldDigest（sha256 规范 JSON）。
 * - entities/relationships/provenance：归一化后的契约形状内容。
 */
export function buildIfcRevision(
  parseResult: IfcParseResult,
  units: IfcUnitAssignment,
  sourceArtifact: string,
): WorldRevision {
  const normalized = normalizeIfcParseResult(parseResult, units, sourceArtifact);
  const worldId = buildIfcWorldId(sourceArtifact, parseResult.contentDigest);
  const worldSource = {
    worldId,
    entities: normalized.entities as readonly WorldEntity[],
    relationships: normalized.relationships as readonly WorldRelationship[],
    provenance: normalized.provenance,
  };
  const digest = computeWorldDigest(worldSource);
  return {
    worldId,
    revisionId: `rev-ifc:${parseResult.contentDigest.slice(0, 12)}`,
    digest,
    entities: worldSource.entities,
    relationships: worldSource.relationships,
    presentationSeed: { seed: `${worldId}:${parseResult.contentDigest.slice(0, 12)}` },
    provenance: normalized.provenance,
  };
}

/** 构造 IFC 重建引擎实例（每次返回新实例，状态隔离）。 */
export function createIfcReconstructionEngine(): ReconstructionEngine {
  return new IfcReconstructionEngine();
}

class IfcReconstructionEngine implements ReconstructionEngine {
  descriptor() {
    return IFC_RECONSTRUCTION_DESCRIPTOR;
  }

  async open(
    input: ReconstructionInput,
    context: ReconstructionContext,
  ): Promise<ReconstructionSession> {
    assertNotEngineNative(input);
    const { bytes, sourceArtifact } = await resolveInputBytes(input);
    // signal 取消：web-ifc 解析是同步的 WASM 调用，无法中断；只在 open 入口
    // 检查已取消信号，长任务上由宿主协作取消（spec「signal：协作取消信号」）。
    if (context.signal?.aborted) {
      throw new Error("IFC reconstruction aborted before open");
    }
    const parseResult = await parseIfc(bytes);
    const units = await readIfcUnitAssignment(bytes);
    const revision = buildIfcRevision(parseResult, units, sourceArtifact);
    context.log?.(
      "info",
      `IFC opened: ${parseResult.schema}, ${parseResult.rawEntities.length} entities`,
    );
    return new IfcReconstructionSession(revision);
  }
}

/**
 * IFC 重建会话：open 的存续期。快照只读——open 后内容不变，snapshot 返回
 * 同一不可变 WorldRevision；close 幂等释放（这里无 WASM 句柄需释放，
 * web-ifc modelID 已在 parseIfc 内 CloseModel）。
 *
 * 不实现 apply（mutate=false，invariant #4）；不实现 subscribe（W009 无
 * 变更流；首版只支持 open + snapshot + close，per spec「Engine interface」）。
 */
class IfcReconstructionSession implements ReconstructionSession {
  private revision: WorldRevision;
  private closed = false;

  constructor(revision: WorldRevision) {
    this.revision = revision;
  }

  async snapshot(): Promise<WorldRevision> {
    this.assertNotClosed();
    return this.revision;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error("IFC reconstruction session is closed");
    }
  }
}
