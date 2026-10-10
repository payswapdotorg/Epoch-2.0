/**
 * @zcode/epoch-gltf 模块清单。
 *
 * 依据 spec/architecture/contracts/world-presentation.md「Compilation」+ ARCHITECTURE-LOCK
 * #5（表现是投影，非第二语义账本）+ #10（glTF 是能力，绝不成为语义权威）+ #16（核心引擎中立）
 * + #17（确定性：fixture/test 必须内容寻址、网络无依赖）。
 *
 * 本模块是「渲染器投递编译」：把冻结的 WorldPresentation 投影为 glTF 2.0 / GLB 二进制，
 * 保留稳定的 presentationId / entityId 1:1 映射（extras.epoch 命名空间），确定性输出
 * （同输入 → 字节相同；固定 key 顺序，无时间戳，无随机）。本模块从不解析 glTF 回世界状态
 * —— 那是未来契约的职责；本模块是纯投影边界（见 contract.ts 头注释）。
 */
export const epochGltfModule = {
  id: "epoch-gltf",
  requires: ["epoch-world-presentation"],
  provides: ["gltf-delivery-compiler"],
  publicEntrypoints: ["index.ts"],
} as const;
