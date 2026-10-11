/**
 * epoch-persistence SurfaceIdentityRegistry 生命周期测试。
 *
 * W021 任务包第 3 条（surface/session 连续性）+ 验收点 6（UI 保持投影、
 * Solution Surface 保持 engine-agnostic）的执行面：
 * - open/activate/close/restore 全周期：稳定 id 的分配与跨周期重推导；
 * - restore 按 digest 重新挂接到同一持久化修订世系（绝不按可变指针）——
 *   通过「跨注册表实例」（模拟新进程）restore 验证；
 * - close 保留持久记录（durable record 不随关闭销毁）；
 * - attachRevision 世系推进：去重、锚点前移/回移；
 * - engine-agnostic：对任意 engineId（含任意字符串）行为一致，无分支。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FileSystemWorldStore,
  InMemoryWorldStore,
  SurfaceIdentityRegistry,
  defaultSessionId,
  defaultSurfaceId,
  defaultTabId,
  isPersistenceError,
} from "../src/index.ts";
import type { WorldStore } from "../src/index.ts";
import { fixtureEngine, fixtureRevision } from "./helpers.ts";

const IDENTITY = { workspaceKey: "ws-life", engineId: "fixture-engine", solutionId: "sol-life" };

function makeRegistry(store: WorldStore): SurfaceIdentityRegistry {
  return new SurfaceIdentityRegistry({ store });
}

test("open (new): assigns deterministic identity, persists revision + solution + surface identity", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revision = fixtureRevision("world-l", "seed-life", "rev-l1");
  const assignment = await registry.open({
    identity: IDENTITY,
    revision,
    engine: fixtureEngine(),
  });
  assert.equal(assignment.created, true);
  // 稳定 id 由身份确定性派生（可跨进程重推导）。
  assert.equal(assignment.identity.surfaceId, defaultSurfaceId(IDENTITY));
  assert.equal(assignment.identity.sessionId, defaultSessionId(IDENTITY));
  assert.equal(assignment.identity.tabId, defaultTabId(IDENTITY));
  // 锚点 = 打开时获得的修订（按 digest）。
  assert.equal(assignment.identity.anchor.digest, revision.digest);
  assert.equal(assignment.identity.anchor.revisionId, revision.revisionId);
  // 三个记录族都进入持久记录。
  assert.deepEqual(await store.loadRevision(revision.digest), {
    revision,
    digest: revision.digest,
    engine: fixtureEngine(),
    persistence: { formatVersion: 1, storeKind: "memory" },
  });
  assert.deepEqual(await store.loadSolution(IDENTITY), {
    identity: IDENTITY,
    lineage: [{ revisionId: revision.revisionId, digest: revision.digest }],
  });
  assert.equal((await store.listSurfaceIdentities()).length, 1);
  assert.equal(registry.list().activeTabId, assignment.identity.tabId);
});

test("open is idempotent while live: same identity reuses ids (created=false), no lineage duplicates", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revision = fixtureRevision("world-l", "seed-idem", "rev-i1");
  const first = await registry.open({ identity: IDENTITY, revision, engine: fixtureEngine() });
  const second = await registry.open({ identity: IDENTITY, revision, engine: fixtureEngine() });
  assert.equal(second.created, false);
  assert.equal(second.identity.tabId, first.identity.tabId);
  assert.equal(second.identity.surfaceId, first.identity.surfaceId);
  assert.equal(second.identity.sessionId, first.identity.sessionId);
  const solution = await store.loadSolution(IDENTITY);
  assert.equal(solution.lineage.length, 1, "no duplicate lineage entries");
  assert.equal((await store.listSurfaceIdentities()).length, 1);
});

test("activate: unknown tab errors; already-active is a no-op", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revision = fixtureRevision("world-l", "seed-act", "rev-ac1");
  const { identity } = await registry.open({
    identity: IDENTITY,
    revision,
    engine: fixtureEngine(),
  });
  assert.equal(registry.list().activeTabId, identity.tabId);
  const reactivated = registry.activate(identity.tabId);
  assert.equal(reactivated.tabId, identity.tabId);
  assert.throws(() => registry.activate("solution:nope|nope|nope"), /not live/);
});

test("close: releases live state, keeps the persisted identity record (durable record survives close)", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revision = fixtureRevision("world-l", "seed-close", "rev-cl1");
  const { identity } = await registry.open({
    identity: IDENTITY,
    revision,
    engine: fixtureEngine(),
  });
  registry.close(identity.tabId);
  assert.deepEqual(registry.list(), { surfaces: [], activeTabId: null });
  // 持久记录仍在——关闭不销毁 durable record。
  const persisted = await store.loadSurfaceIdentity(identity.tabId);
  assert.equal(persisted.tabId, identity.tabId);
  assert.equal(persisted.anchor.digest, revision.digest);
  // 幂等：重复关闭 no-op。
  registry.close(identity.tabId);
  registry.close("solution:unknown");
});

test("restore after close re-attaches to the same persisted revision lineage BY DIGEST", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revisionA = fixtureRevision("world-l", "seed-restore", "rev-r1");
  const revisionB = fixtureRevision("world-l", "seed-restore-longer", "rev-r2");
  const opened = await registry.open({
    identity: IDENTITY,
    revision: revisionA,
    engine: fixtureEngine(),
  });
  await registry.attachRevision({
    identity: IDENTITY,
    revision: revisionB,
    engine: fixtureEngine(),
  });
  registry.close(opened.identity.tabId);

  const restored = await registry.restore(opened.identity.tabId);
  // 同一稳定 id（跨周期重推导）。
  assert.equal(restored.identity.tabId, opened.identity.tabId);
  assert.equal(restored.identity.surfaceId, opened.identity.surfaceId);
  assert.equal(restored.identity.sessionId, opened.identity.sessionId);
  // 重新挂接的是世系头（按 digest）——深相等，且摘要一致。
  assert.equal(restored.identity.anchor.digest, revisionB.digest);
  assert.deepEqual(restored.revision.revision, revisionB);
  assert.deepEqual(
    restored.solution.lineage.map((entry) => entry.digest),
    [revisionA.digest, revisionB.digest],
  );
  assert.equal(registry.list().activeTabId, restored.identity.tabId);
});

test("restore across registry instances (new process simulation) re-derives identity from the store alone", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "epoch-persistence-restore-"));
  try {
    const store = new FileSystemWorldStore({ rootDir: dir });
    const first = makeRegistry(store);
    const revision = fixtureRevision("world-l", "seed-cross", "rev-x1");
    const opened = await first.open({ identity: IDENTITY, revision, engine: fixtureEngine() });
    first.close(opened.identity.tabId);

    // 全新注册表实例（内存 live 状态为零）——只凭 store 恢复。
    const second = makeRegistry(store);
    const restored = await second.restore(opened.identity.tabId);
    assert.equal(restored.identity.tabId, opened.identity.tabId);
    assert.equal(restored.identity.surfaceId, opened.identity.surfaceId);
    assert.deepEqual(restored.revision.revision, revision);
    assert.equal(restored.identity.anchor.digest, revision.digest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore of a never-persisted tabId surfaces as typed record-not-found", async () => {
  const registry = makeRegistry(new InMemoryWorldStore());
  await assert.rejects(
    () => registry.restore("solution:never|persisted|tab"),
    (error: unknown) => isPersistenceError(error) && error.code === "record-not-found",
  );
});

test("restore of a live surface is idempotent (returns the same identity, re-activates)", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revision = fixtureRevision("world-l", "seed-live", "rev-lv1");
  const opened = await registry.open({ identity: IDENTITY, revision, engine: fixtureEngine() });
  registry.activate(opened.identity.tabId);
  const restored = await registry.restore(opened.identity.tabId);
  assert.equal(restored.identity.tabId, opened.identity.tabId);
  assert.deepEqual(restored.revision.revision, revision);
});

test("open after close re-derives the same identity (created=false) and attaches the revision", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revisionA = fixtureRevision("world-l", "seed-reopen", "rev-o1");
  const revisionB = fixtureRevision("world-l", "seed-reopen-plus", "rev-o2");
  const first = await registry.open({
    identity: IDENTITY,
    revision: revisionA,
    engine: fixtureEngine(),
  });
  registry.close(first.identity.tabId);
  const second = await registry.open({
    identity: IDENTITY,
    revision: revisionB,
    engine: fixtureEngine(),
  });
  assert.equal(second.created, false);
  assert.equal(second.identity.tabId, first.identity.tabId);
  assert.equal(second.identity.anchor.digest, revisionB.digest, "anchor advanced to the new head");
  const solution = await store.loadSolution(IDENTITY);
  assert.deepEqual(
    solution.lineage.map((entry) => entry.digest),
    [revisionA.digest, revisionB.digest],
    "lineage keeps full history",
  );
});

test("attachRevision: dedupes by digest; moving back to an old revision moves the anchor only", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const revisionA = fixtureRevision("world-l", "seed-attach", "rev-at1");
  const revisionB = fixtureRevision("world-l", "seed-attach-xx", "rev-at2");
  await registry.open({ identity: IDENTITY, revision: revisionA, engine: fixtureEngine() });
  const afterB = await registry.attachRevision({
    identity: IDENTITY,
    revision: revisionB,
    engine: fixtureEngine(),
  });
  assert.equal(afterB.anchor.digest, revisionB.digest);
  // 同摘要重复附加 → 幂等（世系不变）。
  await registry.attachRevision({
    identity: IDENTITY,
    revision: revisionB,
    engine: fixtureEngine(),
  });
  let solution = await store.loadSolution(IDENTITY);
  assert.equal(solution.lineage.length, 2);
  // 回到旧修订 A → 锚点回移，世系保持完整历史（无重复）。
  const backToA = await registry.attachRevision({
    identity: IDENTITY,
    revision: revisionA,
    engine: fixtureEngine(),
  });
  assert.equal(backToA.anchor.digest, revisionA.digest);
  solution = await store.loadSolution(IDENTITY);
  assert.equal(solution.lineage.length, 2, "lineage unchanged when re-attaching a known digest");
  // 附加的修订确实进入持久记录（store 是唯一持久记录）。
  assert.equal((await store.loadRevision(revisionB.digest)).revision.revisionId, "rev-at2");
});

test("attachRevision on an unknown surface surfaces typed record-not-found (no implicit creation)", async () => {
  const registry = makeRegistry(new InMemoryWorldStore());
  const revision = fixtureRevision("world-l", "seed-unknown", "rev-u1");
  await assert.rejects(
    () =>
      registry.attachRevision({
        identity: { workspaceKey: "ws-x", engineId: "eng-x", solutionId: "sol-x" },
        revision,
        engine: fixtureEngine(),
      }),
    (error: unknown) => isPersistenceError(error) && error.code === "record-not-found",
  );
});

test("engine-agnostic: identical lifecycle behavior for arbitrary engine ids (no branching)", async () => {
  for (const engineId of [
    "ifc-engine",
    "occt- geometry",
    "blender/adapter",
    "自定义引擎",
    "engine-42",
  ]) {
    const store = new InMemoryWorldStore();
    const registry = makeRegistry(store);
    const identity = { workspaceKey: "ws-agnostic", engineId, solutionId: "sol-ag" };
    const revision = fixtureRevision("world-ag", `seed-${engineId.length}`, "rev-ag1");
    const opened = await registry.open({ identity, revision, engine: fixtureEngine(engineId) });
    registry.close(opened.identity.tabId);
    const restored = await registry.restore(opened.identity.tabId);
    assert.equal(restored.identity.anchor.digest, revision.digest, `engineId=${engineId}`);
    assert.equal(restored.revision.engine.engineId, engineId);
    // 稳定 id 派生与引擎无关：同一身份键结构，engineId 只是键的一部分。
    assert.equal(opened.identity.tabId, defaultTabId(identity));
  }
});

test("list() is a stable projection: sorted by tabId, no renderer handles in the identity shape", async () => {
  const store = new InMemoryWorldStore();
  const registry = makeRegistry(store);
  const identities = [
    { workspaceKey: "ws-z", engineId: "e", solutionId: "s-b" },
    { workspaceKey: "ws-a", engineId: "e", solutionId: "s-c" },
    { workspaceKey: "ws-a", engineId: "e", solutionId: "s-a" },
  ];
  for (const identity of identities) {
    await registry.open({
      identity,
      revision: fixtureRevision("world-list", `seed-${identity.solutionId}`, "rev-ls"),
      engine: fixtureEngine(),
    });
  }
  const state = registry.list();
  assert.equal(state.surfaces.length, 3);
  const tabIds = state.surfaces.map((surface) => surface.tabId);
  assert.deepEqual([...tabIds].sort(), tabIds, "sorted by tabId");
  // 身份结构只含稳定字符串 id + 内容寻址锚点——无渲染器句柄、无时间戳。
  for (const surface of state.surfaces) {
    assert.deepEqual(Object.keys(surface).sort(), ["anchor", "sessionId", "surfaceId", "tabId"]);
    assert.match(surface.anchor.digest, /^[0-9a-f]{64}$/);
  }
});
