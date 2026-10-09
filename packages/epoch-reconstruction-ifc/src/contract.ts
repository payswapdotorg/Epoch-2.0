/**
 * epoch-reconstruction-ifc 公开契约：IFC 重建引擎适配器对外暴露面。
 *
 * 只允许从 index.ts import；跨模块不得深引用内部文件（arch-check
 * forbidDeepImports）。这里只 re-export 契约形状（descriptor/engine）与
 * adapter 私有扩展类型（layer/normalization 映射，供宿主/呈现层按图层分类）。
 * web-ifc 类型不跨边界（保留在 adapter 内部）。
 */
export type { IfcEpochLayerId, IfcWorldEntityExtension } from "./layers.ts";
export { IFC_EPOCH_LAYERS, IFC_EPOCH_LAYER_DESCRIPTIONS } from "./layers.ts";
export {
  IFC_RECONSTRUCTION_ENGINE_ID,
  IFC_RECONSTRUCTION_ENGINE_VERSION,
  IFC_RECONSTRUCTION_ENGINE_NAME,
  IFC_RECONSTRUCTION_DESCRIPTOR,
} from "./descriptor.ts";
export { createIfcReconstructionEngine, buildIfcRevision } from "./engine.ts";
export { computeIfcContentDigest } from "./parser.ts";
export { mapIfcTypeToEntityType } from "./normalization.ts";
