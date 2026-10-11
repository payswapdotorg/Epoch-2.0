/**
 * epoch-persistence 缓存定律测试。
 *
 * W021 任务包第 4 条（caching law）的执行面：
 * - 缓存非权威：store 是唯一持久记录——缓存全量丢弃（clear）后，一切
 *   读取仅凭 store 恢复；
 * - 显式失效钩子 invalidateCacheFor(digest)：失配即弃，未命中回源 store；
 * - 持久写后主动失效（而非刷新）：写后读取必须回到 store；
 * - 枚举与解/surface 记录直通 store（缓存只服务按摘要的修订读取）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CachedWorldStore,
  FileSystemWorldStore,
  InMemoryWorldStore,
  WorldRevisionCache,
} from "../src/index.ts";
import { fixtureEngine, fixturePersistedRevision, fixtureRevision } from "./helpers.ts";

test("save delegates to the backing store and invalidates (not refreshes) the cache entry", async () => {
  const backing = new InMemoryWorldStore();
  const cached = new CachedWorldStore(backing);
  const revision = fixtureRevision("world-c", "seed-cache", "rev-c1");
  const record = fixturePersistedRevision(revision, fixtureEngine(), "memory");
  await cached.saveRevision(record);
  // 写后缓存为空——缓存不得假设自己仍代表持久状态。
  assert.equal(cached.cache.stats().entries, 0);
  // 持久记录确实在 store 里（写委托到底层）。
  assert.deepEqual(await backing.loadRevision(record.digest), record);
});

test("loadRevision: first read misses and goes to the store; second read hits the memo", async () => {
  const backing = new InMemoryWorldStore();
  const cached = new CachedWorldStore(backing);
  const revision = fixtureRevision("world-c", "seed-hitmiss", "rev-h1");
  const record = fixturePersistedRevision(revision, fixtureEngine(), "memory");
  await backing.saveRevision(record);
  const first = await cached.loadRevision(record.digest);
  assert.deepEqual(first, record);
  const afterFirst = cached.cache.stats();
  assert.equal(afterFirst.misses, 1);
  assert.equal(afterFirst.hits, 0);
  const second = await cached.loadRevision(record.digest);
  assert.deepEqual(second, record);
  const afterSecond = cached.cache.stats();
  assert.equal(afterSecond.hits, 1);
  assert.equal(afterSecond.misses, 1);
});

test("invalidateCacheFor(digest): dropped entry is recovered from the store alone (identical record)", async () => {
  const backing = new InMemoryWorldStore();
  const cached = new CachedWorldStore(backing);
  const revision = fixtureRevision("world-c", "seed-inval", "rev-in1");
  const record = fixturePersistedRevision(revision, fixtureEngine(), "memory");
  await backing.saveRevision(record);
  await cached.loadRevision(record.digest); // warm the memo
  assert.equal(cached.cache.stats().entries, 1);
  // 显式失效钩子。
  cached.cache.invalidateCacheFor(record.digest);
  assert.equal(cached.cache.stats().entries, 0);
  assert.equal(cached.cache.stats().invalidations, 1);
  // 未命中 → 回源 store → 完全相同的记录（仅凭 store 恢复）。
  const recovered = await cached.loadRevision(record.digest);
  assert.deepEqual(recovered, record);
  assert.equal(cached.cache.stats().misses, 2);
  // 未命中条目的失效是 no-op。
  cached.cache.invalidateCacheFor("c".repeat(64));
  assert.equal(cached.cache.stats().invalidations, 1);
});

test("a fresh empty cache over the same store recovers everything (store is the only durable record)", async () => {
  const backing = new InMemoryWorldStore();
  const seeds = ["one", "two-two", "three-three-three"];
  const records = seeds.map((seed, index) =>
    fixturePersistedRevision(
      fixtureRevision("world-c", seed, `rev-${index}`),
      fixtureEngine(),
      "memory",
    ),
  );
  for (const record of records) await backing.saveRevision(record);
  // 第一个缓存实例读满后整体丢弃（模拟缓存崩溃/进程重启）。
  const firstCache = new WorldRevisionCache();
  const firstCachedStore = new CachedWorldStore(backing, firstCache);
  for (const record of records) await firstCachedStore.loadRevision(record.digest);
  firstCache.clear();
  assert.equal(firstCache.stats().entries, 0);
  // 全新空缓存 + 同一 store：一切照旧可恢复。
  const secondCache = new WorldRevisionCache();
  const secondCachedStore = new CachedWorldStore(backing, secondCache);
  const listed = await secondCachedStore.listRevisions();
  assert.equal(listed.length, records.length);
  for (const record of records) {
    const recovered = await secondCachedStore.loadRevision(record.digest);
    assert.deepEqual(recovered, record, "recoverable from the store alone");
  }
});

test("cache loss never affects store contents (non-authoritative by construction)", async () => {
  const backing = new InMemoryWorldStore();
  const cache = new WorldRevisionCache();
  const cached = new CachedWorldStore(backing, cache);
  const revision = fixtureRevision("world-c", "seed-loss", "rev-l1");
  const record = fixturePersistedRevision(revision, fixtureEngine(), "memory");
  await cached.saveRevision(record);
  await cached.loadRevision(record.digest);
  cache.clear();
  assert.deepEqual(await backing.loadRevision(record.digest), record);
  assert.equal((await backing.listRevisions()).length, 1);
});

test("solution and surface operations pass through to the store (no cache interference)", async () => {
  const backing = new InMemoryWorldStore();
  const cache = new WorldRevisionCache();
  const cached = new CachedWorldStore(backing, cache);
  const revision = fixtureRevision("world-c", "seed-passthrough", "rev-p1");
  const identity = { workspaceKey: "ws-c", engineId: "eng-c", solutionId: "sol-c" };
  await cached.saveSolution({
    identity,
    lineage: [{ revisionId: revision.revisionId, digest: revision.digest }],
  });
  const solution = await cached.loadSolution(identity);
  assert.equal(solution.lineage[0]?.digest, revision.digest);
  await cached.saveSurfaceIdentity({
    surfaceId: "s-1",
    sessionId: "ss-1",
    tabId: "t-1",
    anchor: { identity, revisionId: revision.revisionId, digest: revision.digest },
  });
  const surface = await cached.loadSurfaceIdentity("t-1");
  assert.equal(surface.tabId, "t-1");
  // 直通操作不产生缓存条目/命中统计。
  assert.deepEqual(cache.stats(), { entries: 0, hits: 0, misses: 0, invalidations: 0 });
});

test("caching law holds over the file adapter too (provider-neutral law)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-cachefile-"));
  try {
    const backing = new FileSystemWorldStore({ rootDir: dir });
    const cached = new CachedWorldStore(backing);
    const revision = fixtureRevision("world-c", "seed-filecache", "rev-fc1");
    const record = fixturePersistedRevision(revision, fixtureEngine(), "file");
    await cached.saveRevision(record);
    assert.equal(cached.cache.stats().entries, 0, "invalidated after durable write");
    const loaded = await cached.loadRevision(record.digest);
    assert.deepEqual(loaded, record);
    cached.cache.invalidateCacheFor(record.digest);
    const recovered = await cached.loadRevision(record.digest);
    assert.deepEqual(recovered, record, "recovered from the file store alone");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
