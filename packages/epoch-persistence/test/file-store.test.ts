/**
 * epoch-persistence 文件适配器确定性测试。
 *
 * W021 任务包第 2(a) 条 + ARCHITECTURE-LOCK #17 的执行面：
 * - 内容寻址路径：revisions/<digest[0:2]>/<digest>.json；
 * - 同一修订 → 字节相同的文件（跨实例、跨目录重复保存逐字节一致）；
 * - 载荷无时间戳：文件字节与手构规范 JSON 逐字符相等——store 只写入
 *   「给出的内容」，不添加 savedAt/时间戳/任何额外字段；
 * - 原子写：保存后无残留临时文件；并发保存收敛到一致状态；
 * - 冲突定律：同摘要键上不同字节 → record-conflict（绝不静默覆盖）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { FileSystemWorldStore, canonicalJsonStringify, solutionIdentityKey } from "../src/index.ts";
import { fixtureEngine, fixturePersistedRevision, fixtureRevision } from "./helpers.ts";

test("content-addressed path: revision is stored at revisions/<digest[0:2]>/<digest>.json", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-path-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    const revision = fixtureRevision("world-f", "seed-path", "rev-p1");
    const record = fixturePersistedRevision(revision, fixtureEngine(), "file");
    await store.saveRevision(record);
    const expected = path.join(
      dir,
      "revisions",
      record.digest.slice(0, 2),
      `${record.digest}.json`,
    );
    const bytes = await readFile(expected, "utf8");
    assert.equal(bytes, canonicalJsonStringify(record));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("determinism law: same revision saved into two different roots produces byte-identical files", async () => {
  const dirA = await mkdtemp(path.join(tmpdir(), "epoch-persistence-det-a-"));
  const dirB = await mkdtemp(path.join(tmpdir(), "epoch-persistence-det-b-"));
  try {
    const revision = fixtureRevision("world-f", "seed-determinism", "rev-d1");
    const record = fixturePersistedRevision(revision, fixtureEngine(), "file");
    for (const root of [dirA, dirB]) {
      await new FileSystemWorldStore({ rootDir: root }).saveRevision(record);
    }
    const fileFor = (root: string) =>
      path.join(root, "revisions", record.digest.slice(0, 2), `${record.digest}.json`);
    const bytesA = await readFile(fileFor(dirA));
    const bytesB = await readFile(fileFor(dirB));
    assert.ok(bytesA.equals(bytesB), "byte-identical files across store instances");
  } finally {
    await rm(dirA, { recursive: true, force: true });
    await rm(dirB, { recursive: true, force: true });
  }
});

test("no timestamps inside stored payloads: file bytes equal the hand-built canonical record exactly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-nots-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    const revision = fixtureRevision("world-f", "x", "rev-t1"); // 最小 seed → 2 实体
    const record = fixturePersistedRevision(revision, fixtureEngine("engine-t"), "file");
    await store.saveRevision(record);
    const target = path.join(dir, "revisions", record.digest.slice(0, 2), `${record.digest}.json`);
    const bytes = await readFile(target, "utf8");
    // 与手构规范 JSON 逐字符相等——证明 store 未添加任何字段（时间戳/随机/元数据）。
    assert.equal(bytes, canonicalJsonStringify(record));
    // 载荷中不存在常见时间戳字段名。
    for (const forbidden of ["savedAt", "updatedAt", "timestamp", "writtenAt", "createdAt"]) {
      assert.ok(!bytes.includes(`"${forbidden}"`), `payload must not contain "${forbidden}"`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("re-save of identical content is a byte-level no-op (file untouched, no temp leftovers)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-noop-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    const revision = fixtureRevision("world-f", "seed-noop", "rev-n1");
    const record = fixturePersistedRevision(revision, fixtureEngine(), "file");
    await store.saveRevision(record);
    const target = path.join(dir, "revisions", record.digest.slice(0, 2), `${record.digest}.json`);
    const before = await readFile(target);
    await store.saveRevision(record);
    const after = await readFile(target);
    assert.ok(before.equals(after), "identical re-save leaves the file untouched");
    // 原子写不留临时残留。
    assert.deepEqual(await listFilesDeep(dir), [target]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("atomic write-then-rename: concurrent saves of the same record converge; no tmp files remain", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-atomic-"));
  try {
    const revision = fixtureRevision("world-f", "seed-atomic", "rev-a1");
    const record = fixturePersistedRevision(revision, fixtureEngine(), "file");
    // 同一 root 上两个实例并发保存同一记录（模拟并发宿主写入）。
    const storeA = new FileSystemWorldStore({ rootDir: dir });
    const storeB = new FileSystemWorldStore({ rootDir: dir });
    await Promise.all([storeA.saveRevision(record), storeB.saveRevision(record)]);
    const target = path.join(dir, "revisions", record.digest.slice(0, 2), `${record.digest}.json`);
    assert.equal(await readFile(target, "utf8"), canonicalJsonStringify(record));
    const allFiles = await listFilesDeep(dir);
    assert.deepEqual(allFiles, [target], "no .tmp-* leftovers after atomic rename");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("conflict law: same digest key with different bytes is a typed record-conflict, never overwritten", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-conflict-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    const revision = fixtureRevision("world-f", "seed-conflict", "rev-c1");
    const record = fixturePersistedRevision(revision, fixtureEngine("first-engine"), "file");
    await store.saveRevision(record);
    // 同摘要、不同字节（引擎溯源不同）→ 冲突浮出，绝不静默覆盖。
    const conflicting = fixturePersistedRevision(revision, fixtureEngine("other-engine"), "file");
    await assert.rejects(
      () => store.saveRevision(conflicting),
      (error: unknown) =>
        error instanceof Error && (error as { code?: string }).code === "record-conflict",
    );
    const onDisk = await store.loadRevision(record.digest);
    assert.equal(onDisk.engine.engineId, "first-engine", "original bytes untouched");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("listRevisions enumerates across shard directories; empty store lists empty", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-shards-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    assert.deepEqual(await store.listRevisions(), []);
    const seeds = ["a", "bb", "ccc", "dddd", "eeeee", "12345678"];
    const records = seeds.map((seed, index) =>
      fixturePersistedRevision(
        fixtureRevision("world-f", seed, `rev-s${index}`),
        fixtureEngine(),
        "file",
      ),
    );
    for (const record of records) await store.saveRevision(record);
    const listed = await store.listRevisions();
    assert.equal(listed.length, records.length);
    const digests = listed.map((record) => record.digest);
    assert.deepEqual([...digests].sort(), digests);
    // 分片目录确实被使用（≥2 个不同前缀目录——seed 集合覆盖多前缀）。
    const shardDirs = await readdir(path.join(dir, "revisions"));
    assert.ok(shardDirs.length >= 2, `expected sharding, got ${shardDirs.length} dirs`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("solutions and surfaces are keyed by identity hash; payload carries the plaintext identity", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-keys-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    const revision = fixtureRevision("world-f", "seed-keys", "rev-k1");
    const identity = { workspaceKey: "ws k/1", engineId: "eng k", solutionId: "sol k" };
    await store.saveSolution({
      identity,
      lineage: [{ revisionId: revision.revisionId, digest: revision.digest }],
    });
    const files = await listFilesDeep(path.join(dir, "solutions"));
    assert.equal(files.length, 1);
    assert.match(path.basename(files[0]!), /^[0-9a-f]{64}\.json$/);
    const payload = JSON.parse(await readFile(files[0]!, "utf8"));
    assert.deepEqual(payload.identity, identity);
    // 读取必须用同一身份三元组（键由身份派生）。
    const loaded = await store.loadSolution(identity);
    assert.equal(loaded.lineage[0]?.digest, revision.digest);
    // 键-内容不一致：把 A 身份的载荷放到 B 身份的哈希键下 → record-malformed
    // （按损坏浮出，绝不返回「最接近的」记录）。
    const otherIdentity = {
      workspaceKey: "other-ws",
      engineId: "other-eng",
      solutionId: "other-sol",
    };
    const otherKeyHash = createHash("sha256")
      .update(solutionIdentityKey(otherIdentity))
      .digest("hex");
    const hijacked = path.join(dir, "solutions", `${otherKeyHash}.json`);
    await writeFile(hijacked, await readFile(files[0]!), "utf8");
    await assert.rejects(
      () => store.loadSolution(otherIdentity),
      (error: unknown) =>
        error instanceof Error && (error as { code?: string }).code === "record-malformed",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** 递归列出目录下全部文件（相对→绝对路径，按字典序）。 */
async function listFilesDeep(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  await walk(root);
  return files.sort();
}
