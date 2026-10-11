/**
 * epoch-persistence 验收点映射测试。
 *
 * 每个 W021 验收点在此至少有一个命名测试（深测套件见同目录其余文件，
 * 本文件是验收映射的紧凑执行面）：
 * - A1 公开契约 provider-neutral → 源面导入扫描（无引擎/渲染器/DB 依赖）；
 * - A2 变更行为有自动化测试 → open→attach→close→restore 端到端连续性；
 * - A3 架构检查（owned modules） → 模块清单与提议注册块一致 + 工件齐全；
 * - A4 外部/原生能力限制如实记录 → 内存适配器零文件系统依赖（受限环境
 *   默认实现）；文件适配器为纯 Node fs（无原生依赖）；
 * - A5 无第二语义权威 → 往返 + 重摘要 + 不修复的紧凑复证；
 * - A6 UI 是投影 / Surface engine-agnostic → 身份结构无渲染器句柄；
 *   restore 按摘要重新挂接（投影自持久状态）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeWorldDigest } from "@zcode/epoch-world-model";
import {
  InMemoryWorldStore,
  SurfaceIdentityRegistry,
  epochPersistenceModule,
  isPersistenceError,
} from "../src/index.ts";
import { fixtureEngine, fixturePersistedRevision, fixtureRevision } from "./helpers.ts";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A1/A6：源面只允许 node: 内建、两个冻结契约包与相对导入。 */
async function readSourceImports(): Promise<string[]> {
  const srcDir = path.join(packageRoot, "src");
  const files = await readdir(srcDir);
  const specifiers: string[] = [];
  for (const file of files) {
    if (!file.endsWith(".ts")) continue;
    const source = await readFile(path.join(srcDir, file), "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      specifiers.push(match[1]!);
    }
  }
  return specifiers;
}

test("A1 provider-neutral: source surface imports only node builtins + the two frozen epoch contracts", async () => {
  const allowed = (specifier: string): boolean =>
    specifier.startsWith("node:") ||
    specifier.startsWith("./") ||
    specifier === "@zcode/epoch-world-model" ||
    specifier === "@zcode/epoch-solution-contract";
  const specifiers = await readSourceImports();
  assert.ok(specifiers.length > 0, "source surface must have imports to scan");
  const forbidden = specifiers.filter((specifier) => !allowed(specifier));
  assert.deepEqual(forbidden, [], "no engine/renderer/DB/provider imports allowed");
  // 明确的负面清单（引擎/渲染器/宿主/服务实现）。
  for (const specifier of specifiers) {
    assert.ok(!/babylon|three|ifc|occt|blender|gltf|electron|react/i.test(specifier));
  }
});

test("A2 changed behavior: end-to-end open→attach→close→restore continuity is persisted", async () => {
  const store = new InMemoryWorldStore();
  const registry = new SurfaceIdentityRegistry({ store });
  const identity = { workspaceKey: "ws-a2", engineId: "eng-a2", solutionId: "sol-a2" };
  const revisionA = fixtureRevision("world-a2", "seed-a", "rev-a");
  const revisionB = fixtureRevision("world-a2", "seed-bb", "rev-b");
  const opened = await registry.open({ identity, revision: revisionA, engine: fixtureEngine() });
  await registry.attachRevision({ identity, revision: revisionB, engine: fixtureEngine() });
  registry.close(opened.identity.tabId);
  // 新进程模拟：全新注册表实例只凭 store 恢复同一连续性。
  const fresh = new SurfaceIdentityRegistry({ store });
  const restored = await fresh.restore(opened.identity.tabId);
  assert.equal(restored.identity.tabId, opened.identity.tabId);
  assert.equal(restored.identity.anchor.digest, revisionB.digest);
  assert.deepEqual(restored.revision.revision, revisionB);
  assert.deepEqual(
    restored.solution.lineage.map((entry) => entry.digest),
    [revisionA.digest, revisionB.digest],
  );
});

test("A3 architecture: module manifest matches the proposed registration block; required artifacts exist", async () => {
  assert.equal(epochPersistenceModule.id, "epoch-persistence");
  assert.deepEqual(epochPersistenceModule.requires, [
    "epoch-world-model",
    "epoch-solution-contract",
  ]);
  assert.deepEqual(epochPersistenceModule.publicEntrypoints, ["index.ts"]);
  // managed 模块必需工件（architecture-check 的 missing-module-artifact 规则）。
  const srcDir = path.join(packageRoot, "src");
  const files = new Set(await readdir(srcDir));
  assert.ok(files.has("module.ts"), "module.ts artifact present");
  assert.ok(files.has("contract.ts"), "contract.ts artifact present");
});

test("A4 honest environment limits: memory adapter needs zero file system (constrained-runtime default)", async () => {
  // 纯内存往返——无 fs、无网络、无原生依赖（受限环境的完整功能面）。
  const store = new InMemoryWorldStore();
  const revision = fixtureRevision("world-a4", "seed-mem", "rev-m1");
  const record = fixturePersistedRevision(revision, fixtureEngine(), "memory");
  await store.saveRevision(record);
  assert.deepEqual(await store.loadRevision(record.digest), record);
  assert.equal((await store.listRevisions()).length, 1);
  // 静态面：memory-store.ts 不导入任何 IO 模块（零文件系统依赖）；
  // 文件适配器只用 node: 内建（无原生插件依赖）。
  const memorySource = await readFile(path.join(packageRoot, "src", "memory-store.ts"), "utf8");
  assert.ok(!/from\s+"node:(fs|net|http|child_process)/.test(memorySource));
  const specifiers = await readSourceImports();
  for (const specifier of specifiers) {
    if (specifier.startsWith("node:")) continue;
    assert.ok(specifier.startsWith("./") || specifier.startsWith("@zcode/"));
  }
});

test("A5 no second authority: byte-stable round-trip, identical re-digest, and typed (never repaired) failures", async () => {
  const store = new InMemoryWorldStore();
  const revision = fixtureRevision("world-a5", "seed-authority", "rev-auth1");
  const record = fixturePersistedRevision(revision, fixtureEngine(), "memory");
  await store.saveRevision(record);
  const loaded = await store.loadRevision(record.digest);
  assert.deepEqual(loaded, record, "load(save(rev)) deep-equals rev");
  assert.equal(computeWorldDigest(loaded.revision), loaded.digest, "re-digests identically");
  // 不修复：未知键与畸形输入是 typed error，store 内容不变。
  await assert.rejects(
    () => store.loadRevision("d".repeat(64)),
    (error: unknown) => isPersistenceError(error) && error.code === "record-not-found",
  );
  await assert.rejects(
    () => store.saveRevision({ nope: true }),
    (error: unknown) => isPersistenceError(error) && error.code === "invalid-input",
  );
  assert.equal((await store.listRevisions()).length, 1, "nothing written on failed saves");
});

test("A6 UI remains a projection: identity carries only stable string ids + a digest anchor (no renderer handles)", async () => {
  const store = new InMemoryWorldStore();
  const registry = new SurfaceIdentityRegistry({ store });
  const identity = { workspaceKey: "ws-a6", engineId: "any-engine", solutionId: "sol-a6" };
  const revision = fixtureRevision("world-a6", "seed-projection", "rev-pr1");
  const opened = await registry.open({ identity, revision, engine: fixtureEngine() });
  // 持久化身份是纯 id + 内容寻址锚点：UI 从中「投影」展示，不可能从中
  // 获得渲染器句柄或可变指针。
  assert.deepEqual(Object.keys(opened.identity).sort(), [
    "anchor",
    "sessionId",
    "surfaceId",
    "tabId",
  ]);
  assert.deepEqual(Object.keys(opened.identity.anchor).sort(), [
    "digest",
    "identity",
    "revisionId",
  ]);
  assert.match(opened.identity.anchor.digest, /^[0-9a-f]{64}$/);
  // 锚定修订即权威 WorldRevision 原样（渲染器/表现种子只是其中的投影材料）。
  assert.equal(opened.revision.revision.presentationSeed.seed, "seed-projection");
  assert.deepEqual(opened.revision.revision.entities, revision.entities);
});
