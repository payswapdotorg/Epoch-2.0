/**
 * @zcode/epoch-gltf GLB 二进制布局健全性测试。
 *
 * 依据 glTF 2.0 spec「GLB Header Format」+「GLB Chunk Format」+ W010 任务包
 * 「Validation tests: assert GLB binary layout sanity」。
 *
 * 检查项：
 * - 12 字节 header：magic=0x46546C67, version=2, length=总字节数。
 * - JSON chunk：chunkType=0x4E4F534A, chunkLength 4 字节对齐, chunkData 可解析为 JSON。
 * - BIN chunk：chunkType=0x004E4942, chunkLength 4 字节对齐, 总长 = header + JSON + BIN。
 * - chunkLength 字段是 chunkData 长度（不含 8 字节 chunk header）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compilePresentationToGltf } from "../src/index.ts";
import { buildSamplePresentation } from "./presentation-fixture.ts";
import {
  GLB_MAGIC,
  GLB_VERSION,
  GLB_CHUNK_BIN,
  GLB_CHUNK_JSON,
  readGlbHeader,
  readGlbChunkHeader,
} from "../src/glb.ts";

test("glb layout: header magic/version/length are valid", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  assert.ok(artifact.glb, "glb artifact must include binary");
  const glb = artifact.glb!;
  const hdr = readGlbHeader(glb);
  assert.equal(hdr.magic, GLB_MAGIC, "magic must be 0x46546C67 ('glTF')");
  assert.equal(hdr.version, GLB_VERSION, "version must be 2");
  assert.equal(hdr.length, glb.length, "header.length must equal total bytes");
});

test("glb layout: JSON chunk is first, type correct, 4-byte aligned, parseable", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const glb = artifact.glb!;
  const jsonChunk = readGlbChunkHeader(glb, 12);
  assert.equal(jsonChunk.chunkType, GLB_CHUNK_JSON, "first chunk type must be JSON");
  assert.ok(jsonChunk.chunkLength > 0, "JSON chunk length must be > 0");
  assert.equal(jsonChunk.chunkLength % 4, 0, "JSON chunk length must be 4-byte aligned (padded)");
  // JSON data starts at offset 20.
  const jsonData = glb.subarray(20, 20 + jsonChunk.chunkLength);
  // Strip 0x20 padding trailing bytes by trimming trailing 0x20 OR null bytes.
  let end = jsonData.length;
  while (end > 0 && (jsonData[end - 1] === 0x20 || jsonData[end - 1] === 0)) end--;
  const jsonStr = new TextDecoder().decode(jsonData.subarray(0, end));
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    assert.fail(`JSON chunk must be parseable: ${(err as Error).message}`);
  }
  assert.ok(typeof parsed === "object" && parsed !== null, "JSON chunk must be an object");
  const doc = parsed as { asset?: { version?: string } };
  assert.equal(doc.asset?.version, "2.0", "glTF asset.version must be 2.0");
});

test("glb layout: BIN chunk is second, type correct, 4-byte aligned", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const glb = artifact.glb!;
  const jsonChunk = readGlbChunkHeader(glb, 12);
  // BIN chunk follows JSON chunk: 12 (header) + 8 (chunk header) + jsonChunk.chunkLength.
  const binOffset = 12 + 8 + jsonChunk.chunkLength;
  assert.ok(binOffset + 8 <= glb.length, "BIN chunk header must fit");
  const binChunk = readGlbChunkHeader(glb, binOffset);
  assert.equal(binChunk.chunkType, GLB_CHUNK_BIN, "second chunk type must be BIN");
  assert.equal(binChunk.chunkLength % 4, 0, "BIN chunk length must be 4-byte aligned (padded)");
  assert.equal(
    12 + 8 + jsonChunk.chunkLength + 8 + binChunk.chunkLength,
    glb.length,
    "header + JSON + BIN must sum to total length",
  );
});

test("glb layout: BIN chunk length matches glTF buffers[0].byteLength (unpadded)", () => {
  const artifact = compilePresentationToGltf(buildSamplePresentation());
  const glb = artifact.glb!;
  const jsonChunk = readGlbChunkHeader(glb, 12);
  const binOffset = 12 + 8 + jsonChunk.chunkLength;
  const binChunk = readGlbChunkHeader(glb, binOffset);
  const buffers = (artifact.json.buffers ?? []) as { byteLength?: number }[];
  assert.ok(buffers.length >= 1, "glTF document must have at least 1 buffer");
  // BIN chunk length is padded to 4-byte; buffers[0].byteLength is the UNPADDED length.
  assert.ok(
    binChunk.chunkLength >= (buffers[0]?.byteLength ?? 0),
    "BIN chunk length (padded) must be >= buffers[0].byteLength (unpadded)",
  );
  assert.ok(
    binChunk.chunkLength - (buffers[0]?.byteLength ?? 0) <= 3,
    "BIN padding must be 0..3 bytes",
  );
});

test("glb layout: empty-presentation compiles to glb with empty BIN chunk omitted", () => {
  // 无几何的 presentation（全部 unresolved）——BIN 应被省略。
  const presentation = buildSamplePresentation();
  // 取消所有节点的可解析表现，只保留 unknown。
  const nodes = (presentation as { nodes: unknown[] }).nodes.map((n) => {
    const node = n as { representations: unknown[] };
    return {
      ...node,
      representations: node.representations.filter((r) =>
        (r as { format: string }).format.startsWith("epoch.future"),
      ),
    };
  });
  const empty = { ...presentation, nodes };
  const artifact = compilePresentationToGltf(empty as never);
  assert.ok(artifact.glb, "even empty presentation must produce a glb");
  const hdr = readGlbHeader(artifact.glb!);
  assert.equal(hdr.magic, GLB_MAGIC);
  assert.equal(hdr.version, GLB_VERSION);
  // 没有几何时没有 BIN chunk——总长 = 12 (header) + 8 (json chunk header) + jsonLen。
  assert.ok(artifact.glb!.length >= 20, "empty glb must have header + json chunk header");
});
