/**
 * W028 验收点 2：A provider registers through descriptors rather than a new
 * workbench surface type.
 *
 * 断言：
 * - EnvironmentRegistry.register(provider) 把 provider 加入注册表；
 *   controller.open(providerId) 时经 registry.resolve(providerId) 取 provider——
 *   控制器不按 providerId 分支，不导入 provider 实现。
 * - 新增第二个 provider 不需要新的 surface 类型/handler 分支——两个 provider
 *   产出 tab.type 都是 "application-environment"。
 * - 未注册的 providerId 经 registry.resolve 抛错；controller.open 不静默降级
 *   为「无 provider 默认会话」（验收点 2 的强诚实性）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EnvironmentSurfaceController } from "../../packages/epoch-environment-surface/src/index.ts";
import {
  createFakeProvider,
  createRuntimeWith,
  fullCapabilityDescriptor,
} from "./fake-provider.ts";

test("acceptance-2: providers register through descriptors; controller resolves via registry (no providerId branch)", async () => {
  const alpha = createFakeProvider(
    fullCapabilityDescriptor({ id: "provider-alpha", name: "Alpha" }),
  );
  const beta = createFakeProvider(fullCapabilityDescriptor({ id: "provider-beta", name: "Beta" }));
  const controller = new EnvironmentSurfaceController(createRuntimeWith([alpha, beta]));

  const a = await controller.open({
    workspaceKey: "ws",
    providerId: "provider-alpha",
    mode: "observe-only",
    initiator: "human",
  });
  const b = await controller.open({
    workspaceKey: "ws",
    providerId: "provider-beta",
    mode: "observe-only",
    initiator: "human",
  });

  assert.equal(a.descriptor.id, "provider-alpha");
  assert.equal(b.descriptor.id, "provider-beta");
  assert.notEqual(a.tab.id, b.tab.id);
  // 验收点 2 的核心断言：两个 provider 共用同一 surface 类型，新增 provider
  // 不引入新 surface 类型。
  assert.equal(a.tab.type, "application-environment");
  assert.equal(b.tab.type, "application-environment");
  assert.equal(controller.list().tabs.length, 2);
});

test("acceptance-2: unregistered providerId is rejected — no silent fallback to a default session", async () => {
  const controller = new EnvironmentSurfaceController(createRuntimeWith([]));

  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws",
        providerId: "never-registered",
        mode: "observe-only",
        initiator: "human",
      }),
    /environment provider not registered/,
  );
  assert.equal(controller.list().tabs.length, 0);
});

test("acceptance-2: registry.list returns descriptors in registration order (UI展示用)", () => {
  const alpha = createFakeProvider(
    fullCapabilityDescriptor({ id: "provider-alpha", name: "Alpha" }),
  );
  const beta = createFakeProvider(fullCapabilityDescriptor({ id: "provider-beta", name: "Beta" }));
  const { registry } = createRuntimeWith([alpha, beta]);
  const listed = registry.list();
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.id, "provider-alpha");
  assert.equal(listed[1]?.id, "provider-beta");
});
