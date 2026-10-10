/**
 * @zcode/epoch-gltf 公共入口。
 *
 * 渲染器投递编译（W010）：把冻结的 WorldPresentation 投影为 glTF 2.0 / GLB 二进制，
 * 保留稳定的 presentationId / entityId 1:1 映射（extras.epoch 命名空间），确定性输出
 * （同输入 → 字节相同；固定 key 顺序，无时间戳/随机）；从不解析 glTF 回世界状态——
 * 那是未来契约的职责，本模块是纯投影边界（ARCHITECTURE-LOCK #5/#10）。
 *
 * 零运行时依赖；不含 Babylon/Three/glTF 解析库——glTF 文档由本包手写编码。
 */
export type {
  GltfFormat,
  GltfPrimitiveMode,
  GltfDocument,
  ResolvedGeometry,
  RepresentationResolver,
  GltfDeliveryOptions,
  GltfArtifact,
  GltfMappingTable,
  GltfMappingEntry,
  GltfMappingRepresentation,
  GltfUnresolvedRepresentation,
} from "./contract.ts";
export {
  isGltfFormat,
  isGltfPrimitiveMode,
  isGltfDeliveryOptions,
  isGltfArtifact,
  isGltfMappingTable,
} from "./contract.ts";
export { epochGltfModule } from "./module.ts";
export { compilePresentationToGltf, extractMapping } from "./compiler.ts";
export {
  resolveInlinedRepresentation,
  EPOCH_BOX_FORMAT,
  EPOCH_TRIANGLES_FORMAT,
  EPOCH_LINEWORK_FORMAT,
} from "./representation-fabric.ts";
export { EPOCH_EXTRAS_KEY } from "./mapping.ts";
