/**
 * @zcode/epoch-gltf GLB 2.0 二进制容器编码器。
 *
 * 依据 glTF 2.0 spec「GLB Header Format」+「GLB Chunk Format」：
 * - 12 字节 header：magic (0x46546C67 = "glTF") + version (2) + length (总字节数)。
 * - JSON chunk：4 字节 chunkLength + 4 字节 chunkType (0x4E4F534A = "JSON")
 *   + chunkData (UTF-8 canonical JSON，0x20 padding 至 4 字节对齐)。
 * - BIN chunk：4 字节 chunkLength + 4 字节 chunkType (0x004E4942 = "BIN\0")
 *   + chunkData (二进制 buffer，0x00 padding 至 4 字节对齐)。
 *
 * 确定性：chunk 顺序固定（JSON 先，BIN 后）；padding 字节固定（0x20 / 0x00）；
 * 字节序固定（little-endian）。同输入 → 字节相同（见 determinism.ts 摘要）。
 */

/** GLB magic = "glTF" little-endian ASCII。 */
export const GLB_MAGIC = 0x46546c67;
/** GLB version = 2。 */
export const GLB_VERSION = 2;
/** JSON chunk type = "JSON" little-endian ASCII。 */
export const GLB_CHUNK_JSON = 0x4e4f534a;
/** BIN chunk type = "BIN\0" little-endian ASCII。 */
export const GLB_CHUNK_BIN = 0x004e4942;

function padTo4(n: number): number {
  const rem = n % 4;
  return rem === 0 ? 0 : 4 - rem;
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

/** 把 JSON 串 + 二进制 buffer 编码为 GLB 2.0 字节流。binary 可选（无几何时允许空）。 */
export function encodeGlb(jsonString: string, binary: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(jsonString);
  const jsonPad = padTo4(jsonBytes.length);
  const binPad = padTo4(binary.length);
  const jsonChunkDataLen = jsonBytes.length + jsonPad;
  const binChunkDataLen = binary.length + binPad;
  const jsonChunkTotal = 8 + jsonChunkDataLen;
  const binChunkTotal = binary.length === 0 ? 0 : 8 + binChunkDataLen;
  const totalLength = 12 + jsonChunkTotal + binChunkTotal;
  const out = new Uint8Array(totalLength);
  // Header.
  writeUint32LE(out, 0, GLB_MAGIC);
  writeUint32LE(out, 4, GLB_VERSION);
  writeUint32LE(out, 8, totalLength);
  // JSON chunk.
  let off = 12;
  writeUint32LE(out, off, jsonChunkDataLen);
  writeUint32LE(out, off + 4, GLB_CHUNK_JSON);
  off += 8;
  out.set(jsonBytes, off);
  for (let i = 0; i < jsonPad; i++) out[off + jsonBytes.length + i] = 0x20;
  off += jsonBytes.length + jsonPad;
  // BIN chunk (only if non-empty).
  if (binary.length > 0) {
    writeUint32LE(out, off, binChunkDataLen);
    writeUint32LE(out, off + 4, GLB_CHUNK_BIN);
    off += 8;
    out.set(binary, off);
    for (let i = 0; i < binPad; i++) out[off + binary.length + i] = 0x00;
  }
  return out;
}

/** 解析 GLB 头部三段（magic/version/length）——供 layout 测试断言。 */
export function readGlbHeader(buf: Uint8Array): {
  magic: number;
  version: number;
  length: number;
} {
  if (buf.length < 12) {
    return { magic: -1, version: -1, length: -1 };
  }
  return {
    magic: buf[0]! | (buf[1]! << 8) | (buf[2]! << 16) | (buf[3]! << 24),
    version: buf[4]! | (buf[5]! << 8) | (buf[6]! << 16) | (buf[7]! << 24),
    length: buf[8]! | (buf[9]! << 8) | (buf[10]! << 16) | (buf[11]! << 24),
  };
}

/** 解析 GLB chunk 头部（chunkLength/chunkType）——供 layout 测试断言。 */
export function readGlbChunkHeader(
  buf: Uint8Array,
  offset: number,
): {
  chunkLength: number;
  chunkType: number;
} {
  if (buf.length < offset + 8) {
    return { chunkLength: -1, chunkType: -1 };
  }
  return {
    chunkLength:
      buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24),
    chunkType:
      buf[offset + 4]! |
      (buf[offset + 5]! << 8) |
      (buf[offset + 6]! << 16) |
      (buf[offset + 7]! << 24),
  };
}
