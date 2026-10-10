/**
 * epoch-application-environment registry unit tests.
 *
 * 验证 createEnvironmentRegistry 的注册/解析/列出语义 + 重复 id 覆盖 +
 * 未知 id 抛错 + isModeCompatibleWithDescriptor 兼容性矩阵。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEnvironmentRegistry,
  isEnvironmentProvider,
  isModeCompatibleWithDescriptor,
} from "../src/index.ts";
import type { EnvironmentProvider, EnvironmentDescriptor } from "../src/index.ts";

function makeDescriptor(overrides: Partial<EnvironmentDescriptor> = {}): EnvironmentDescriptor {
  return {
    id: "fake-app",
    name: "Fake App",
    version: "1.0.0",
    runtime: "local",
    planes: [{ plane: "observe", operations: ["list-windows"], available: true }],
    maxAutonomyMode: "full",
    adapterSeams: ["screen"],
    simulation: false,
    sensitiveDataNeeds: "default-exclude",
    ...overrides,
  };
}

function makeProvider(descriptor: EnvironmentDescriptor): EnvironmentProvider {
  return {
    descriptor: () => descriptor,
    async attach() {
      throw new Error("not implemented in unit test");
    },
  };
}

test("registry.register stores provider; resolve returns it; list preserves order", () => {
  const registry = createEnvironmentRegistry();
  const a = makeProvider(makeDescriptor({ id: "alpha" }));
  const b = makeProvider(makeDescriptor({ id: "beta" }));
  registry.register(a);
  registry.register(b);
  assert.equal(registry.resolve("alpha"), a);
  assert.equal(registry.resolve("beta"), b);
  assert.equal(registry.list().length, 2);
  assert.equal(registry.list()[0]?.id, "alpha");
  assert.equal(registry.list()[1]?.id, "beta");
});

test("registry.register with duplicate id replaces provider but keeps registration order", () => {
  const registry = createEnvironmentRegistry();
  const a = makeProvider(makeDescriptor({ id: "shared", name: "A" }));
  const b = makeProvider(makeDescriptor({ id: "shared", name: "B" }));
  registry.register(a);
  registry.register(b);
  // b 覆盖 a。
  assert.equal(registry.resolve("shared"), b);
  assert.equal(registry.describe("shared")?.name, "B");
  // 顺序保持不变（仍是注册时第一次出现的位置）。
  assert.equal(registry.list().length, 1);
});

test("registry.resolve throws on unknown id (no silent fallback)", () => {
  const registry = createEnvironmentRegistry();
  assert.throws(() => registry.resolve("never-registered"), /environment provider not registered/);
});

test("registry.describe returns undefined for unknown id", () => {
  const registry = createEnvironmentRegistry();
  assert.equal(registry.describe("never-registered"), undefined);
});

test("registry.register rejects malformed provider (TypeError)", () => {
  const registry = createEnvironmentRegistry();
  // 缺 attach 方法
  assert.throws(
    () =>
      registry.register({ descriptor: () => makeDescriptor() } as unknown as EnvironmentProvider),
    /expects a well-formed EnvironmentProvider/,
  );
  // descriptor 返回的不是合法 descriptor
  assert.throws(
    () =>
      registry.register({
        descriptor: () => ({ ...makeDescriptor(), id: "" }),
        attach: async () => {
          throw new Error("not implemented");
        },
      }),
    /must return a well-formed EnvironmentDescriptor/,
  );
});

test("isEnvironmentProvider: well-formed passes; malformed fails", () => {
  assert.equal(
    isEnvironmentProvider({
      descriptor: () => makeDescriptor(),
      attach: async () => {
        throw new Error("not implemented");
      },
    }),
    true,
  );
  assert.equal(isEnvironmentProvider({ descriptor: () => makeDescriptor() }), false);
  assert.equal(isEnvironmentProvider(null), false);
  assert.equal(isEnvironmentProvider("not an object"), false);
});

test("isModeCompatibleWithDescriptor: requested <= max passes; > fails", () => {
  // max = observe-only
  assert.equal(isModeCompatibleWithDescriptor("observe-only", "observe-only"), true);
  assert.equal(isModeCompatibleWithDescriptor("observe-only", "suggest"), false);
  // max = confirmation
  assert.equal(isModeCompatibleWithDescriptor("confirmation", "observe-only"), true);
  assert.equal(isModeCompatibleWithDescriptor("confirmation", "suggest"), true);
  assert.equal(isModeCompatibleWithDescriptor("confirmation", "confirmation"), true);
  assert.equal(isModeCompatibleWithDescriptor("confirmation", "bounded-autonomy"), false);
  // max = full
  assert.equal(isModeCompatibleWithDescriptor("full", "full"), true);
  assert.equal(isModeCompatibleWithDescriptor("full", "observe-only"), true);
});
