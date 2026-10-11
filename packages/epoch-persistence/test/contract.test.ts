/**
 * epoch-persistence 契约测试：typed core 结构 + 类型化错误 + provider-neutral。
 *
 * W021 验收点 1（公开契约 provider-neutral）的执行面：
 * - typed core 三件套（PersistedRevision/PersistedSolution/
 *   SessionSurfaceIdentity）结构完整且守卫正确拒绝畸形输入；
 * - PersistenceError 按 code 判别（七个冻结错误码）；
 * - **第三方适配器**在测试内实现 WorldStore 端口（模拟外部 DB 接入）并完成
 *   完整 save/load 往返——证明外部提供者无需触碰世界模型或渲染器即可接入。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERSISTENCE_FORMAT_VERSION,
  PersistenceError,
  canonicalJsonStringify,
  isEngineProvenance,
  isPersistenceError,
  isPersistedRevision,
  isPersistedSolution,
  isSessionSurfaceIdentity,
  isSolutionIdentity,
  isSurfaceRestoreAnchor,
  solutionIdentityFromTab,
  solutionIdentityKey,
} from "../src/index.ts";
import { fixtureEngine, fixturePersistedRevision, fixtureRevision } from "./helpers.ts";
import type {
  PersistedRevision,
  PersistedSolution,
  SessionSurfaceIdentity,
  SolutionIdentity,
  WorldStore,
} from "../src/index.ts";

const IDENTITY: SolutionIdentity = {
  workspaceKey: "ws://fixture",
  engineId: "fixture-engine",
  solutionId: "sol-001",
};

test("typed core: PersistedRevision carries revision + digest + engine provenance + persistence metadata", () => {
  const revision = fixtureRevision("world-a", "seed-one", "rev-001");
  const record = fixturePersistedRevision(revision, fixtureEngine("engine-x"), "file");
  assert.equal(record.revision, revision);
  assert.equal(record.digest, revision.digest);
  assert.equal(record.engine.engineId, "engine-x");
  assert.equal(record.persistence.formatVersion, PERSISTENCE_FORMAT_VERSION);
  assert.equal(record.persistence.storeKind, "file");
  assert.ok(isPersistedRevision(record));
});

test("typed core: PersistedSolution carries identity + revision lineage it points at", () => {
  const revisionA = fixtureRevision("world-a", "seed-one", "rev-001");
  const revisionB = fixtureRevision("world-a", "seed-two-longer", "rev-002");
  const solution: PersistedSolution = {
    identity: IDENTITY,
    lineage: [
      { revisionId: revisionA.revisionId, digest: revisionA.digest },
      { revisionId: revisionB.revisionId, digest: revisionB.digest },
    ],
  };
  assert.ok(isPersistedSolution(solution));
  assert.deepEqual(
    solution.lineage.map((entry) => entry.digest),
    [revisionA.digest, revisionB.digest],
  );
});

test("typed core: SessionSurfaceIdentity carries surface id, session id, tab identity and restore anchor", () => {
  const revision = fixtureRevision("world-a", "seed-one", "rev-001");
  const identity: SessionSurfaceIdentity = {
    surfaceId: "epoch-surface:ws%3A%2F%2Ffixture|fixture-engine|sol-001",
    sessionId: "epoch-session:ws%3A%2F%2Ffixture|fixture-engine|sol-001",
    tabId: "solution:ws%3A%2F%2Ffixture|fixture-engine|sol-001",
    anchor: {
      identity: IDENTITY,
      revisionId: revision.revisionId,
      digest: revision.digest,
    },
  };
  assert.ok(isSessionSurfaceIdentity(identity));
  assert.ok(isSurfaceRestoreAnchor(identity.anchor));
  // 恢复锚点是内容寻址摘要——不是可变指针。
  assert.match(identity.anchor.digest, /^[0-9a-f]{64}$/);
});

test("guards reject malformed records (each corrupted field surfaces as not-persistable)", () => {
  const revision = fixtureRevision("world-a", "seed-one", "rev-001");
  const record = fixturePersistedRevision(revision);
  assert.ok(!isPersistedRevision({ ...record, digest: "0".repeat(64) }));
  assert.ok(!isPersistedRevision({ ...record, digest: revision.digest, revision: null }));
  assert.ok(!isPersistedRevision({ ...record, engine: { engineId: "" } }));
  assert.ok(!isPersistedRevision({ ...record, persistence: { formatVersion: 0, storeKind: "x" } }));
  const solution: PersistedSolution = {
    identity: IDENTITY,
    lineage: [{ revisionId: "r", digest: revision.digest }],
  };
  assert.ok(!isPersistedSolution({ ...solution, lineage: [] }));
  assert.ok(
    !isPersistedSolution({
      ...solution,
      lineage: [
        { revisionId: "r1", digest: revision.digest },
        { revisionId: "r2", digest: revision.digest },
      ],
    }),
    "duplicate digests in lineage are malformed",
  );
  assert.ok(!isSolutionIdentity({ ...IDENTITY, workspaceKey: "" }));
  assert.ok(!isEngineProvenance({ ...fixtureEngine(), runtime: 7 }));
});

test("typed errors: PersistenceError discriminates by code; all seven frozen codes constructible", () => {
  const codes = [
    "invalid-input",
    "record-not-found",
    "record-corrupt",
    "record-malformed",
    "unsupported-format",
    "digest-mismatch",
    "record-conflict",
  ] as const;
  for (const code of codes) {
    const error = new PersistenceError({ code, storeKind: "file", key: "k", message: "m" });
    assert.ok(isPersistenceError(error));
    assert.equal(error.code, code);
    assert.equal(error.storeKind, "file");
    assert.equal(error.key, "k");
    assert.ok(error instanceof Error);
  }
  assert.ok(!isPersistenceError(new Error("plain")));
});

test("canonical serialization is deterministic and key-order independent", () => {
  assert.equal(canonicalJsonStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJsonStringify({ a: 1, b: 2 }), '{"a":1,"b":2}');
  assert.equal(canonicalJsonStringify([3, 1, 2]), "[3,1,2]", "arrays keep order");
  assert.throws(() => canonicalJsonStringify({ x: Number.NaN }), TypeError);
});

test("identity key: URL-encoded segments joined with | (same shape as W003 idempotency key)", () => {
  const key = solutionIdentityKey(IDENTITY);
  assert.equal(key, "ws%3A%2F%2Ffixture|fixture-engine|sol-001");
  assert.notEqual(solutionIdentityKey({ ...IDENTITY, solutionId: "sol-002" }), key);
});

test("identity projection from a W003 SolutionSurfaceTab drops presentation-only fields", () => {
  const revision = fixtureRevision("world-a", "seed-one", "rev-001");
  const tab = {
    id: "solution:tab-1",
    type: "solution" as const,
    workspaceKey: "ws://fixture",
    ownerTaskId: null,
    engineId: "fixture-engine",
    sessionId: "session-1",
    solutionId: "sol-001",
    title: "Fixture Solution",
    openedAt: 1700000000000,
  };
  const identity = solutionIdentityFromTab(tab);
  assert.deepEqual(identity, IDENTITY);
  assert.equal(solutionIdentityKey(identity), solutionIdentityKey(IDENTITY));
  assert.ok(!("openedAt" in identity), "openedAt (presentation state) must not leak into identity");
  assert.equal(revision.worldId, "world-a");
  assert.throws(() => solutionIdentityFromTab({ ...tab, type: "browser" }), TypeError);
});

/**
 * 第三方适配器（模拟外部 DB）：纯 Map 实现，不经过本包任何适配器代码——
 * 证明 provider-neutral 端口可被任意外部提供者实现。
 */
class ThirdPartyDatabaseStore implements WorldStore {
  readonly storeKind = "third-party-db";
  private readonly table = new Map<string, string>();

  async saveRevision(record: PersistedRevision): Promise<void> {
    this.table.set(`rev:${record.digest}`, canonicalJsonStringify(record));
  }

  async loadRevision(digest: string): Promise<PersistedRevision> {
    const text = this.table.get(`rev:${digest}`);
    if (text === undefined) {
      throw new PersistenceError({
        code: "record-not-found",
        storeKind: this.storeKind,
        key: digest,
        message: `missing ${digest}`,
      });
    }
    return JSON.parse(text) as PersistedRevision;
  }

  async listRevisions(): Promise<readonly PersistedRevision[]> {
    return [...this.table.entries()]
      .filter(([key]) => key.startsWith("rev:"))
      .map(([, text]) => JSON.parse(text) as PersistedRevision)
      .sort((left, right) => (left.digest < right.digest ? -1 : 1));
  }

  async saveSolution(solution: PersistedSolution): Promise<void> {
    this.table.set(
      `sol:${solutionIdentityKey(solution.identity)}`,
      canonicalJsonStringify(solution),
    );
  }

  async loadSolution(identity: SolutionIdentity): Promise<PersistedSolution> {
    const text = this.table.get(`sol:${solutionIdentityKey(identity)}`);
    if (text === undefined) {
      throw new PersistenceError({
        code: "record-not-found",
        storeKind: this.storeKind,
        message: "missing solution",
      });
    }
    return JSON.parse(text) as PersistedSolution;
  }

  async listSolutions(): Promise<readonly PersistedSolution[]> {
    return [];
  }

  async saveSurfaceIdentity(identity: SessionSurfaceIdentity): Promise<void> {
    this.table.set(`sf:${identity.tabId}`, canonicalJsonStringify(identity));
  }

  async loadSurfaceIdentity(tabId: string): Promise<SessionSurfaceIdentity> {
    const text = this.table.get(`sf:${tabId}`);
    if (text === undefined) {
      throw new PersistenceError({
        code: "record-not-found",
        storeKind: this.storeKind,
        key: tabId,
        message: "missing surface",
      });
    }
    return JSON.parse(text) as SessionSurfaceIdentity;
  }

  async listSurfaceIdentities(): Promise<readonly SessionSurfaceIdentity[]> {
    return [];
  }
}

test("provider-neutral: a third-party (external DB) adapter implements the port and round-trips records", async () => {
  const store = new ThirdPartyDatabaseStore();
  const revision = fixtureRevision("world-a", "seed-one", "rev-001");
  const record = fixturePersistedRevision(revision, fixtureEngine(), store.storeKind);
  await store.saveRevision(record);
  const loaded = await store.loadRevision(record.digest);
  assert.deepEqual(loaded, record, "external adapter round-trips the record exactly");
  assert.deepEqual(await store.listRevisions(), [record]);
  await assert.rejects(
    () => store.loadRevision("f".repeat(64)),
    (error: unknown) => isPersistenceError(error) && error.code === "record-not-found",
  );
});
