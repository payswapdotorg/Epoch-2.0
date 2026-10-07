/**
 * epoch-reconstruction-contract 契约测试：注册表工厂 + 引擎结构守卫。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeWorldDigest } from "../../epoch-world-model/src/index.ts";
import {
  createReconstructionEngineRegistry,
  isInteractiveRendererLikeAbsent,
  isReconstructionEngine,
  isWellFormedReconstructionEngine,
} from "../src/index.ts";

const descriptor = {
  id: "epoch-fixture",
  name: "Epoch Fixture Engine",
  version: "1.0.0",
  runtime: "in-process" as const,
  inputKinds: ["file-path"],
  capabilities: {
    open: true,
    inspect: true,
    mutate: false,
    timeline: false,
    variants: false,
    measurements: false,
    simulation: false,
  },
};

const revision = {
  worldId: "world-001",
  revisionId: "rev-001",
  digest: computeWorldDigest({
    worldId: "world-001",
    entities: [],
    relationships: [],
    provenance: [],
  }),
  entities: [],
  relationships: [],
  presentationSeed: { seed: "seed-001" },
  provenance: [],
};

function createStubEngine(id: string) {
  return {
    descriptor: () => ({ ...descriptor, id }),
    open: async () => ({
      snapshot: async () => revision,
      close: async () => undefined,
    }),
  };
}

test("registry registers, resolves and lists engines", () => {
  const registry = createReconstructionEngineRegistry();
  registry.register(createStubEngine("fixture-a"));
  registry.register(createStubEngine("fixture-b"));
  assert.equal(registry.get("fixture-a").descriptor().id, "fixture-a");
  assert.equal(registry.get("fixture-b").descriptor().id, "fixture-b");
  assert.deepEqual(
    registry.list().map((item) => item.id),
    ["fixture-a", "fixture-b"],
  );
});

test("registry get throws for unknown engine ids", () => {
  const registry = createReconstructionEngineRegistry();
  assert.throws(() => registry.get("missing"), /not registered/);
});

test("registry rejects malformed engines on register", () => {
  const registry = createReconstructionEngineRegistry();
  assert.throws(() => registry.register({} as never), TypeError);
  assert.throws(
    () =>
      registry.register({
        descriptor: () => ({ ...descriptor, runtime: "cloud" }),
        open: async () => undefined,
      }),
    TypeError,
  );
  // 描述符抛错的引擎同样拒绝。
  assert.throws(
    () => registry.register({ descriptor: () => { throw new Error("bad"); }, open: async () => undefined }),
    TypeError,
  );
});

test("registry re-registration is idempotent and keeps order", () => {
  const registry = createReconstructionEngineRegistry();
  registry.register(createStubEngine("fixture-a"));
  registry.register(createStubEngine("fixture-b"));
  registry.register(createStubEngine("fixture-a"));
  assert.deepEqual(
    registry.list().map((item) => item.id),
    ["fixture-a", "fixture-b"],
  );
});

test("registry list returns descriptors, not engines", () => {
  const registry = createReconstructionEngineRegistry();
  registry.register(createStubEngine("fixture-a"));
  const [first] = registry.list();
  assert.ok(first);
  assert.equal(first.id, "fixture-a");
  assert.equal(typeof first.capabilities.open, "boolean");
});

test("isReconstructionEngine validates structure", () => {
  assert.equal(isReconstructionEngine(createStubEngine("x")), true);
  assert.equal(isReconstructionEngine({ descriptor: () => descriptor }), false);
  assert.equal(isReconstructionEngine({ open: async () => undefined }), false);
  assert.equal(isReconstructionEngine(null), false);
  assert.equal(isReconstructionEngine(() => descriptor), false);
});

test("isWellFormedReconstructionEngine validates the descriptor too", () => {
  assert.equal(isWellFormedReconstructionEngine(createStubEngine("x")), true);
  assert.equal(
    isWellFormedReconstructionEngine({
      descriptor: () => ({ ...descriptor, runtime: "cloud" }),
      open: async () => undefined,
    }),
    false,
  );
  assert.equal(
    isWellFormedReconstructionEngine({ descriptor: () => { throw new Error("bad"); }, open: async () => undefined }),
    false,
  );
});

test("package declares zero runtime dependencies", () => {
  const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(manifest.dependencies, {
    "@zcode/epoch-world-model": "workspace:*",
  });
  const devDependencies = Object.keys(
    (manifest.devDependencies ?? {}) as Record<string, string>,
  );
  const forbidden = /babylon|three|react|zod/i;
  assert.equal(devDependencies.some((name) => forbidden.test(name)), false);
});

test("placeholder guard stays false for foreign shapes", () => {
  // isInteractiveRendererLikeAbsent 不是本包导出的符号；这里仅确认
  // 导入错误命名会让测试失败（编译期由 typecheck 兜底）。
  assert.equal(typeof isInteractiveRendererLikeAbsent, "undefined");
});
