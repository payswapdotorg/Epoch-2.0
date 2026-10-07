/**
 * epoch-reconstruction-contract 公开契约：重建引擎的注册/打开/会话。
 * 只允许从 index.ts import；跨模块不得深引用内部文件。
 */
export type { ReconstructionEngineCapabilities, ReconstructionEngineDescriptor } from "./descriptor.ts";
export type { ReconstructionRuntime } from "./descriptor.ts";
export {
  RECONSTRUCTION_RUNTIMES,
  RECONSTRUCTION_RUNTIME_SET,
  isReconstructionEngineCapabilities,
  isReconstructionEngineDescriptor,
  isReconstructionRuntime,
} from "./descriptor.ts";
export type {
  ByteReferenceReconstructionInput,
  EngineNativeReconstructionInput,
  FilePathReconstructionInput,
  ReconstructionInput,
  ReconstructionInputKind,
  RemoteResourceReconstructionInput,
  WorkspaceArtifactReconstructionInput,
} from "./input.ts";
export {
  RECONSTRUCTION_INPUT_KINDS,
  isReconstructionInput,
  isReconstructionInputKind,
} from "./input.ts";
export type { ReconstructionContext, ReconstructionLogSink } from "./context.ts";
export { isReconstructionContext } from "./context.ts";
export type { ReconstructionOperation, ReconstructionSessionStatus, ReconstructionEvent } from "./events.ts";
export {
  RECONSTRUCTION_SESSION_STATUSES,
  isReconstructionEvent,
  isReconstructionOperation,
  isReconstructionSessionStatus,
} from "./events.ts";
export type { ReconstructionEngine, ReconstructionSession } from "./engine.ts";
export {
  isReconstructionEngine,
  isWellFormedReconstructionEngine,
} from "./engine.ts";
export type { ReconstructionEngineRegistry } from "./registry.ts";
export { createReconstructionEngineRegistry } from "./registry.ts";
