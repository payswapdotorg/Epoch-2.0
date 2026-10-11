/**
 * epoch-persistence 存储往返定律测试（provider-neutral——对两个出厂适配器
 * 参数化执行同一套定律）。
 *
 * W021 验收点 5（No second authority）的执行面：
 * - 字节稳定往返：load(save(rev)) 与 rev 深相等，且重新摘要一致；
 * - save 幂等：同摘要同内容重复保存为 no-op；
 * - 不修复定律：畸形输入、摘要不一致、未知键全部以 PersistenceError
 *   （typed）浮出，store 从不写「修复后的」内容；
 * - 损坏浮出（文件适配器）：垃圾字节 → record-corrupt；篡改内容但保留
 *   摘要 → digest-mismatch——绝不静默返回「最接近的」记录；
 * - 诚实的能力差异：内存适配器无外部篡改面，损坏类错误按构造不可触发。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { computeWorldDigest } from "@zcode/epoch-world-model";
import {
  FileSystemWorldStore,
  InMemoryWorldStore,
  PersistenceError,
  canonicalJsonStringify,
  isPersistenceError,
} from "../src/index.ts";
import type { PersistedRevision, WorldStore } from "../src/index.ts";
import { fixtureEngine, fixturePersistedRevision, fixtureRevision } from "./helpers.ts";

/** 参数化：同一套 provider-neutral 定律对两个适配器都必须成立。 */
async function makeStores(): Promise<{ store: WorldStore; cleanup?: () => Promise<void> }[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-roundtrip-"));
  const fileStore = new FileSystemWorldStore({ rootDir: dir });
  return [
    { store: fileStore, cleanup: () => rm(dir, { recursive: true, force: true }) },
    { store: new InMemoryWorldStore() },
  ];
}

test("round-trip law: load(save(rev)) deep-equals rev and re-digests identically (both adapters)", async () => {
  for (const { store, cleanup } of await makeStores()) {
    try {
      const revision = fixtureRevision("world-rt", "seed-alpha", "rev-a1");
      const record = fixturePersistedRevision(
        revision,
        fixtureEngine("rt-engine"),
        store.storeKind,
      );
      await store.saveRevision(record);
      const loaded = await store.loadRevision(record.digest);
      assert.deepEqual(loaded, record, `${store.storeKind}: load(save(rev)) must deep-equal rev`);
      assert.equal(computeWorldDigest(loaded.revision), loaded.digest, "re-digests identically");
      assert.equal(computeWorldDigest(loaded.revision), record.digest);
      assert.equal(
        canonicalJsonStringify(loaded),
        canonicalJsonStringify(record),
        "canonical bytes identical after round-trip",
      );
    } finally {
      await cleanup?.();
    }
  }
});

test("save is idempotent per digest: re-saving the same record is a no-op (both adapters)", async () => {
  for (const { store, cleanup } of await makeStores()) {
    try {
      const revision = fixtureRevision("world-rt", "seed-beta", "rev-b1");
      const record = fixturePersistedRevision(revision, fixtureEngine(), store.storeKind);
      await store.saveRevision(record);
      await store.saveRevision(record);
      await store.saveRevision(record);
      assert.equal((await store.listRevisions()).length, 1, "no duplicate records");
      assert.deepEqual(await store.loadRevision(record.digest), record);
    } finally {
      await cleanup?.();
    }
  }
});

test("listRevisions returns deterministic digest-ascending order (both adapters)", async () => {
  for (const { store, cleanup } of await makeStores()) {
    try {
      const records = [
        fixturePersistedRevision(
          fixtureRevision("world-rt", "s1", "r1"),
          fixtureEngine(),
          store.storeKind,
        ),
        fixturePersistedRevision(
          fixtureRevision("world-rt", "s22", "r2"),
          fixtureEngine(),
          store.storeKind,
        ),
        fixturePersistedRevision(
          fixtureRevision("world-rt", "s333", "r3"),
          fixtureEngine(),
          store.storeKind,
        ),
      ];
      for (const record of records) await store.saveRevision(record);
      const listed = await store.listRevisions();
      assert.equal(listed.length, 3);
      const digests = listed.map((record) => record.digest);
      assert.deepEqual([...digests].sort(), digests, "sorted ascending by digest");
    } finally {
      await cleanup?.();
    }
  }
});

test("no-repair: malformed records and digest mismatches surface as typed errors, nothing is written", async () => {
  for (const { store, cleanup } of await makeStores()) {
    try {
      const revision = fixtureRevision("world-rt", "seed-gamma", "rev-g1");
      // 声明摘要与修订镜像不一致 → 结构性 invalid-input（保存侧拦截）。
      const mirrored = {
        ...fixturePersistedRevision(revision, fixtureEngine(), store.storeKind),
        digest: "0".repeat(64),
      };
      await assert.rejects(
        () => store.saveRevision(mirrored as unknown as PersistedRevision),
        (error: unknown) => isPersistenceError(error) && error.code === "invalid-input",
      );
      // 摘要与修订镜像一致、但与内容不符（内容被篡改）→ digest-mismatch。
      const tamperedRevision = {
        ...revision,
        entities: revision.entities.map((entity) => ({ ...entity, label: "TAMPERED" })),
      };
      const contentMismatch = fixturePersistedRevision(
        tamperedRevision as typeof revision,
        fixtureEngine(),
        store.storeKind,
      );
      await assert.rejects(
        () => store.saveRevision(contentMismatch),
        (error: unknown) => isPersistenceError(error) && error.code === "digest-mismatch",
      );
      // 结构畸形 → invalid-input。
      await assert.rejects(
        () => store.saveRevision({ bogus: true } as unknown as PersistedRevision),
        (error: unknown) => isPersistenceError(error) && error.code === "invalid-input",
      );
      // 未知摘要 → record-not-found。
      await assert.rejects(
        () => store.loadRevision("a".repeat(64)),
        (error: unknown) => isPersistenceError(error) && error.code === "record-not-found",
      );
      // 畸形摘要键 → invalid-input。
      await assert.rejects(
        () => store.loadRevision("not-a-digest"),
        (error: unknown) => isPersistenceError(error) && error.code === "invalid-input",
      );
      // 保存侧从未写入任何字节。
      assert.deepEqual(await store.listRevisions(), []);
    } finally {
      await cleanup?.();
    }
  }
});

test("solution records: save/load/list round-trip; unknown identity is record-not-found", async () => {
  for (const { store, cleanup } of await makeStores()) {
    try {
      const revisionA = fixtureRevision("world-rt", "seed-delta", "rev-d1");
      const revisionB = fixtureRevision("world-rt", "seed-delta-longer", "rev-d2");
      const identity = { workspaceKey: "ws-rt", engineId: "eng-rt", solutionId: "sol-rt" };
      await store.saveSolution({
        identity,
        lineage: [
          { revisionId: revisionA.revisionId, digest: revisionA.digest },
          { revisionId: revisionB.revisionId, digest: revisionB.digest },
        ],
      });
      const loaded = await store.loadSolution(identity);
      assert.equal(loaded.lineage.length, 2);
      assert.equal(loaded.lineage[1]?.digest, revisionB.digest);
      assert.deepEqual(await store.listSolutions(), [
        {
          identity,
          lineage: [
            { revisionId: revisionA.revisionId, digest: revisionA.digest },
            { revisionId: revisionB.revisionId, digest: revisionB.digest },
          ],
        },
      ]);
      await assert.rejects(
        () => store.loadSolution({ workspaceKey: "nope", engineId: "e", solutionId: "s" }),
        (error: unknown) => isPersistenceError(error) && error.code === "record-not-found",
      );
    } finally {
      await cleanup?.();
    }
  }
});

test("surface identity records: save/load/list round-trip; upsert replaces", async () => {
  for (const { store, cleanup } of await makeStores()) {
    try {
      const revision = fixtureRevision("world-rt", "seed-eps", "rev-e1");
      const identity = { workspaceKey: "ws-rt", engineId: "eng-rt", solutionId: "sol-rt" };
      const base = {
        surfaceId: "surface-1",
        sessionId: "session-1",
        tabId: "tab-1",
        anchor: { identity, revisionId: revision.revisionId, digest: revision.digest },
      };
      await store.saveSurfaceIdentity(base);
      const advanced = { ...base, anchor: { ...base.anchor, revisionId: "rev-e2" } };
      await store.saveSurfaceIdentity(advanced);
      assert.deepEqual(await store.loadSurfaceIdentity("tab-1"), advanced, "upsert replaces");
      assert.equal((await store.listSurfaceIdentities()).length, 1);
      await assert.rejects(
        () => store.loadSurfaceIdentity("tab-unknown"),
        (error: unknown) => isPersistenceError(error) && error.code === "record-not-found",
      );
    } finally {
      await cleanup?.();
    }
  }
});

test("corruption surfacing (file adapter): garbage bytes → record-corrupt; tampered content with kept digest → digest-mismatch", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-corrupt-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    const revision = fixtureRevision("world-c", "seed-corrupt", "rev-c1");
    const record = fixturePersistedRevision(revision, fixtureEngine(), "file");
    await store.saveRevision(record);
    const target = path.join(dir, "revisions", record.digest.slice(0, 2), `${record.digest}.json`);

    // 垃圾字节 → record-corrupt。
    await writeFile(target, "<<<not json at all>>>", "utf8");
    await assert.rejects(
      () => store.loadRevision(record.digest),
      (error: unknown) => isPersistenceError(error) && error.code === "record-corrupt",
    );

    // 篡改修订内容但保留摘要 → digest-mismatch（校验浮出，绝不返回被改内容）。
    const tampered = {
      ...record,
      revision: {
        ...record.revision,
        entities: record.revision.entities.map((entity) => ({ ...entity, label: "TAMPERED" })),
      },
    };
    await writeFile(target, canonicalJsonStringify(tampered), "utf8");
    await assert.rejects(
      () => store.loadRevision(record.digest),
      (error: unknown) => isPersistenceError(error) && error.code === "digest-mismatch",
    );

    // 未知格式版本 → unsupported-format。
    const futureFormat = { ...record, persistence: { ...record.persistence, formatVersion: 999 } };
    await writeFile(target, canonicalJsonStringify(futureFormat), "utf8");
    await assert.rejects(
      () => store.loadRevision(record.digest),
      (error: unknown) => isPersistenceError(error) && error.code === "unsupported-format",
    );

    // 结构畸形（合法 JSON 但缺字段）→ record-malformed。
    await writeFile(target, '{"digest":"kept"}', "utf8");
    await assert.rejects(
      () => store.loadRevision(record.digest),
      (error: unknown) => isPersistenceError(error) && error.code === "record-malformed",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("typed error details carry storeKind and key for diagnosis", async () => {
  const store = new InMemoryWorldStore();
  try {
    await store.loadRevision("b".repeat(64));
    assert.fail("expected rejection");
  } catch (error) {
    assert.ok(error instanceof PersistenceError);
    assert.equal(error.code, "record-not-found");
    assert.equal(error.storeKind, "memory");
    assert.equal(error.key, "b".repeat(64));
  }
});

test("honest capability difference: memory adapter has no external tampering surface (file bytes are the file adapter's disk surface)", async () => {
  // 内存适配器的记录只经过程序化 API 写入（保存侧全量校验），不存在磁盘
  // 篡改面——record-corrupt 在该适配器上按构造不可触发。此测试固定这一
  // 诚实差异：内存往返恒定通过守卫路径。
  const store = new InMemoryWorldStore();
  const revision = fixtureRevision("world-m", "seed-mem", "rev-m1");
  const record = fixturePersistedRevision(revision, fixtureEngine(), "memory");
  await store.saveRevision(record);
  for (let round = 0; round < 3; round += 1) {
    const loaded = await store.loadRevision(record.digest);
    assert.deepEqual(loaded, record);
  }
});
