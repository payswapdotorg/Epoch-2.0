/**
 * W009 验收测试（强制）：摘要稳定性——open() 的相同 IFC 输入产生相同 digest。
 *
 * 依据 spec/work-orders/W009「Determinism」与 world-model「Determinism」：
 * 用 N>=5 次独立 open（每次新建引擎实例）断言 digest 全等；同一 IFC 文件
 * 字节恒产生相同 WorldRevision.digest（web-ifc 解析确定性 + 文件内容
 * sha256 摘要确定性 + 冻结 computeWorldDigest）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createIfcReconstructionEngine } from "../src/index.ts";
import type {
  ReconstructionInput,
  ReconstructionContext,
} from "@zcode/epoch-reconstruction-contract";

const CONTEXT: ReconstructionContext = { workspaceKey: "ws-ifc-test" };

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/pump-house.ifc",
);

async function fixtureInput(): Promise<ReconstructionInput> {
  return { kind: "file-path", path: FIXTURE_PATH };
}

test("repeated open() yields identical digest across N>=5 fresh engines", async () => {
  const input = await fixtureInput();
  const digests: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const engine = createIfcReconstructionEngine();
    const session = await engine.open(input, CONTEXT);
    const revision = await session.snapshot();
    digests.push(revision.digest);
    await session.close();
  }
  const first = digests[0]!;
  for (const digest of digests) assert.equal(digest, first);
  assert.equal(new Set(digests).size, 1, "all digests must be identical");
});

test("digest is 64-char lowercase hex (frozen sha256 pattern)", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open(await fixtureInput(), CONTEXT);
  const revision = await session.snapshot();
  assert.match(revision.digest, /^[0-9a-f]{64}$/);
  await session.close();
});

test("revisionId and worldId are deterministic across opens", async () => {
  const input = await fixtureInput();
  const ids: { worldId: string; revisionId: string }[] = [];
  for (let i = 0; i < 5; i += 1) {
    const engine = createIfcReconstructionEngine();
    const session = await engine.open(input, CONTEXT);
    const revision = await session.snapshot();
    ids.push({ worldId: revision.worldId, revisionId: revision.revisionId });
    await session.close();
  }
  const first = ids[0]!;
  for (const item of ids) {
    assert.equal(item.worldId, first.worldId);
    assert.equal(item.revisionId, first.revisionId);
  }
  assert.equal(new Set(ids.map((item) => item.worldId)).size, 1);
  assert.equal(new Set(ids.map((item) => item.revisionId)).size, 1);
});

test("snapshot() is stable across repeated calls within a session", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open(await fixtureInput(), CONTEXT);
  const a = await session.snapshot();
  const b = await session.snapshot();
  const c = await session.snapshot();
  assert.equal(a.digest, b.digest);
  assert.equal(a.digest, c.digest);
  assert.equal(a.revisionId, b.revisionId);
  await session.close();
});

test("byte-reference input yields the same digest as file-path input (same bytes)", async () => {
  const bytes = await readFile(FIXTURE_PATH);
  // byte-reference treats `reference` as a path the host resolved; same bytes -> same digest.
  const byteInput: ReconstructionInput = { kind: "byte-reference", reference: FIXTURE_PATH };

  const fileEngine = createIfcReconstructionEngine();
  const fileSession = await fileEngine.open(await fixtureInput(), CONTEXT);
  const fileRevision = await fileSession.snapshot();
  await fileSession.close();

  const byteEngine = createIfcReconstructionEngine();
  const byteSession = await byteEngine.open(byteInput, CONTEXT);
  const byteRevision = await byteSession.snapshot();
  await byteSession.close();

  assert.equal(byteRevision.digest, fileRevision.digest);
  assert.equal(byteRevision.worldId, fileRevision.worldId);
  void bytes;
});

test("content digest in provenance matches sha256 of the IFC file bytes", async () => {
  const { createHash } = await import("node:crypto");
  const bytes = await readFile(FIXTURE_PATH);
  const expected = createHash("sha256").update(bytes).digest("hex");

  const engine = createIfcReconstructionEngine();
  const session = await engine.open(await fixtureInput(), CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const fileProv = revision.provenance.find((ref) => ref.kind === "file");
  assert.ok(fileProv, "revision provenance must carry a file ref");
  assert.equal(fileProv.digest, expected);
  assert.equal(fileProv.engineId, "epoch.reconstruction-ifc");
});
