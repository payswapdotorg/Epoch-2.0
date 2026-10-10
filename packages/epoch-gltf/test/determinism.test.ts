/**
 * @zcode/epoch-gltf 确定性测试：同输入 → 字节相同（N>=5 重复编译摘要）。
 *
 * 依据 ARCHITECTURE-LOCK #17 + W010 任务包「Determinism」。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { compilePresentationToGltf } from "../src/index.ts";
import { buildSamplePresentation } from "./presentation-fixture.ts";

const N = 7;

test("determinism: N>=5 repeated glb compiles yield byte-identical digest", () => {
  const presentation = buildSamplePresentation();
  const digests: string[] = [];
  const glbByteHashes: string[] = [];
  for (let i = 0; i < N; i++) {
    const artifact = compilePresentationToGltf(presentation);
    digests.push(artifact.digest);
    // 直接对 GLB 字节取 sha256，独立于编译器自身摘要字段。
    const bytes = artifact.glb ?? new Uint8Array();
    glbByteHashes.push(createHash("sha256").update(bytes).digest("hex"));
  }
  // 全部摘要必须相等。
  const firstDigest = digests[0]!;
  for (const d of digests) assert.equal(d, firstDigest, `digest mismatch on repeat`);
  // 全部 GLB 字节哈希必须相等。
  const firstHash = glbByteHashes[0]!;
  for (const h of glbByteHashes) assert.equal(h, firstHash, `glb byte hash mismatch on repeat`);
  // 摘要必须是 64 字符 hex（sha256）。
  assert.match(firstDigest, /^[0-9a-f]{64}$/, "digest must be sha256 hex");
  // 至少 5 次重复（满足 W010 N>=5 约束）。
  assert.ok(digests.length >= 5, "must run at least 5 repeated compiles");
});

test("determinism: glb and gltf formats produce independent but each-stable digests", () => {
  const presentation = buildSamplePresentation();
  const glbDigests: string[] = [];
  const gltfDigests: string[] = [];
  for (let i = 0; i < N; i++) {
    glbDigests.push(compilePresentationToGltf(presentation, { format: "glb" }).digest);
    gltfDigests.push(compilePresentationToGltf(presentation, { format: "gltf" }).digest);
  }
  // Each format stable across repeats.
  for (const d of glbDigests) assert.equal(d, glbDigests[0]!, "glb digest must be stable");
  for (const d of gltfDigests) assert.equal(d, gltfDigests[0]!, "gltf digest must be stable");
  // The two formats are different byte representations, so digests MUST differ.
  assert.notEqual(
    glbDigests[0],
    gltfDigests[0],
    "glb and glt formats should produce different digests",
  );
});

test("determinism: digest is independent of input array order ONLY by identity, NOT by reordering", () => {
  // 同一 fixture 重复构造，digest 必须相同（fixture 自身确定性）。
  const p1 = buildSamplePresentation();
  const p2 = buildSamplePresentation();
  const a1 = compilePresentationToGltf(p1);
  const a2 = compilePresentationToGltf(p2);
  assert.equal(a1.digest, a2.digest, "same fixture input must yield same digest");
  assert.equal(a1.mapping.digest, a2.mapping.digest, "mapping.digest stable");
});

test("determinism: no timestamps or randomness leak into output", () => {
  // 跨 ~2 秒重复编译——若编译器注入 Date.now()/Math.random()，digest 会变。
  const presentation = buildSamplePresentation();
  const first = compilePresentationToGltf(presentation).digest;
  const start = Date.now();
  while (Date.now() - start < 1500) {
    // spin briefly to cross a time boundary
  }
  const second = compilePresentationToGltf(presentation).digest;
  assert.equal(first, second, "digest must not depend on wall clock");
});
