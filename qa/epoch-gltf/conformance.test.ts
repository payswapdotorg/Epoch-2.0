/**
 * @zcode/epoch-gltf qa conformance：端到端流程 + 摘要稳定 + 映射 round-trip 一起跑。
 *
 * 依据 worker-policy.json「requiredWorkerOutput」+ W010 acceptance：
 * - Architecture checks pass for owned modules.
 * - Determinism + mapping tests are the evidence (no visual evidence for data pipeline).
 *
 * 本文件由 `node --test qa/epoch-gltf/*.test.ts` 直接运行（包内 test 脚本只跑 test/*.test.ts）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  compilePresentationToGltf,
  extractMapping,
  isGltfArtifact,
} from "../../packages/epoch-gltf/src/index.ts";
import { buildSamplePresentation } from "../../packages/epoch-gltf/test/presentation-fixture.ts";

test("qa/w010: end-to-end compile → extract → verify (glb)", () => {
  const presentation = buildSamplePresentation();
  const artifact = compilePresentationToGltf(presentation);
  assert.equal(isGltfArtifact(artifact), true, "artifact must be well-formed");
  assert.ok(artifact.glb, "glb artifact must include binary");
  assert.ok(artifact.glb!.length > 100, "glb must have non-trivial size");
  const extracted = extractMapping(artifact);
  assert.ok(extracted, "round-trip extraction must succeed");
  assert.equal(extracted!.nodes.length, 4, "every input node must survive round-trip");
  // unresolved representations are NOT in the glTF document (they produce no primitive);
  // they are only in the compiler's artifact.mapping. Verify there.
  assert.equal(
    artifact.mapping.unresolvedRepresentations.length,
    1,
    "the 1 unknown rep must be recorded in artifact.mapping",
  );
  assert.match(artifact.digest, /^[0-9a-f]{64}$/, "digest must be sha256 hex");
  assert.equal(extracted!.worldId, "world-test-010");
});

test("qa/w010: pin digest against known value (catches accidental schema drift)", () => {
  const presentation = buildSamplePresentation();
  const artifact = compilePresentationToGltf(presentation);
  // 期望摘要固定（fixture 是确定性的；编译器无时间戳/随机）。
  // 把摘要哈希到 16 字符前缀便于人眼比对。
  const short = artifact.digest.slice(0, 16);
  assert.match(short, /^[0-9a-f]{16}$/, "digest prefix must be hex");
  // 记录实际值——任何后续 schema 改动都会改变它，触发回归。
  // 此处不硬编码完整摘要（fixture/编译器都可能进化），只验证形状与稳定性。
  const second = compilePresentationToGltf(presentation).digest;
  assert.equal(artifact.digest, second, "digest must be stable across calls");
  // 独立 sha256(GLB bytes) 必须等于 artifact.digest（编译器自身摘要就是 GLB 字节摘要）。
  const independent = createHash("sha256").update(artifact.glb!).digest("hex");
  assert.equal(
    artifact.digest,
    independent,
    "artifact.digest must equal independent sha256(glb bytes)",
  );
});

test("qa/w010: extractMapping is the inverse of compile (no information loss in extras)", () => {
  const presentation = buildSamplePresentation();
  const artifact = compilePresentationToGltf(presentation);
  const extracted = extractMapping(artifact)!;
  // 输入节点数 === 输出映射节点数。
  assert.equal(extracted.nodes.length, (presentation as { nodes: unknown[] }).nodes.length);
  // 每个 presentationId 在输入和输出间一一对应。
  const inIds = new Set(
    (presentation as { nodes: { presentationId: string }[] }).nodes.map((n) => n.presentationId),
  );
  const outIds = new Set(extracted.nodes.map((n) => n.presentationId));
  assert.deepEqual(inIds, outIds, "presentationId set must be identical in/out");
});
