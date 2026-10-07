/**
 * epoch-reconstruction-contract 输入边界。
 *
 * 依据 spec/architecture/contracts/reconstruction-engine.md「Input boundary」：
 * 输入在到达引擎之前必须被分类并校验。五种分类（判别字段 kind）：
 * file-path / byte-reference / workspace-artifact / remote-resource / engine-native。
 * engine-native 载荷对共享契约是不透明的（unknown），引擎原生值不得泄漏进
 * Solution Surface 契约。
 */

/** 输入种类判别值（冻结集合）。 */
export const RECONSTRUCTION_INPUT_KINDS = [
  "file-path",
  "byte-reference",
  "workspace-artifact",
  "remote-resource",
  "engine-native",
] as const;
export type ReconstructionInputKind = (typeof RECONSTRUCTION_INPUT_KINDS)[number];

/** 输入种类守卫。 */
export function isReconstructionInputKind(value: unknown): value is ReconstructionInputKind {
  return (
    typeof value === "string" &&
    RECONSTRUCTION_INPUT_KINDS.includes(value as ReconstructionInputKind)
  );
}

/** 本地文件路径输入。 */
export interface FilePathReconstructionInput {
  readonly kind: "file-path";
  readonly path: string;
  readonly formatHint?: string;
  readonly byteLength?: number;
}

/** 字节/对象引用输入：指向进程内或存储中的字节或对象（不内联大载荷）。 */
export interface ByteReferenceReconstructionInput {
  readonly kind: "byte-reference";
  readonly reference: string;
  readonly byteLength?: number;
  readonly formatHint?: string;
}

/** 工作区工件输入：workspaceKey + 工件路径（工件由 host 解析）。 */
export interface WorkspaceArtifactReconstructionInput {
  readonly kind: "workspace-artifact";
  readonly workspaceKey: string;
  readonly artifactPath: string;
  readonly formatHint?: string;
}

/** 远端资源输入（uri 由引擎/宿主按信任边界解析）。 */
export interface RemoteResourceReconstructionInput {
  readonly kind: "remote-resource";
  readonly uri: string;
  readonly formatHint?: string;
}

/**
 * 引擎原生项目描述符输入：payload 为该引擎私有格式（opaque），
 * 只允许路由给 descriptor.id 声明的引擎，禁止进入共享 UI 契约。
 */
export interface EngineNativeReconstructionInput {
  readonly kind: "engine-native";
  readonly engineId: string;
  readonly payload: unknown;
}

/** 重建输入判别联合。 */
export type ReconstructionInput =
  | FilePathReconstructionInput
  | ByteReferenceReconstructionInput
  | WorkspaceArtifactReconstructionInput
  | RemoteResourceReconstructionInput
  | EngineNativeReconstructionInput;

function isFormatHint(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function isByteLength(value: unknown): boolean {
  return (
    value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

/** 重建输入守卫：按 kind 分派，必填字段类型错误即拒绝。 */
export function isReconstructionInput(value: unknown): value is ReconstructionInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.kind !== "string") return false;
  switch (candidate.kind) {
    case "file-path":
      return (
        typeof candidate.path === "string" &&
        candidate.path.length > 0 &&
        isFormatHint(candidate.formatHint) &&
        isByteLength(candidate.byteLength)
      );
    case "byte-reference":
      return (
        typeof candidate.reference === "string" &&
        candidate.reference.length > 0 &&
        isFormatHint(candidate.formatHint) &&
        isByteLength(candidate.byteLength)
      );
    case "workspace-artifact":
      return (
        typeof candidate.workspaceKey === "string" &&
        candidate.workspaceKey.length > 0 &&
        typeof candidate.artifactPath === "string" &&
        candidate.artifactPath.length > 0 &&
        isFormatHint(candidate.formatHint)
      );
    case "remote-resource":
      return (
        typeof candidate.uri === "string" &&
        candidate.uri.length > 0 &&
        isFormatHint(candidate.formatHint)
      );
    case "engine-native":
      return typeof candidate.engineId === "string" && candidate.engineId.length > 0;
    default:
      return false;
  }
}
