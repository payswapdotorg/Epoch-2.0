/**
 * epoch-environment-surface controller unit tests.
 *
 * 验证 EnvironmentSurfaceController 的核心 lifecycle：
 * - open 幂等：同一身份重复 open 不重复 attach，created=false。
 * - open 校验 mode 与 descriptor 兼容性（拒绝 mode > maxAutonomyMode）。
 * - open 校验 sensitiveDataPolicy 不超 descriptor needs（验收点 5）。
 * - close 幂等：已关闭/未知 tab no-op 成功。
 * - activate：已激活 no-op；未知 tabId 抛错。
 * - call：先 precheckOperation 门控，再交 session 执行。
 * - healthOf：未知 tabId 返回 detached/unreachable。
 *
 * 验收点级别的测试见 qa/epoch-application-environment/。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EnvironmentSurfaceController } from "../src/index.ts";
import {
  createFakeProvider,
  createRuntimeWith,
  fullCapabilityDescriptor,
  op,
} from "../../../qa/epoch-application-environment/fake-provider.ts";

test("open is idempotent: same identity second open reuses tab; provider.attach called once", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "idempotent-app", name: "Idempotent App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const first = await controller.open({
    workspaceKey: "ws",
    providerId: "idempotent-app",
    mode: "observe-only",
    initiator: "human",
  });
  const second = await controller.open({
    workspaceKey: "ws",
    providerId: "idempotent-app",
    mode: "observe-only",
    initiator: "human",
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.tab.id, second.tab.id);
  assert.equal(provider.attachCalls(), 1);
});

test("open rejects mode > descriptor.maxAutonomyMode (no silent downgrade)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "strict-app",
      name: "Strict App",
      maxAutonomyMode: "observe-only",
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws",
        providerId: "strict-app",
        mode: "full",
        initiator: "human",
      }),
    /attach mode full exceeds provider strict-app maxAutonomyMode observe-only/,
  );
  assert.equal(provider.attachCalls(), 0);
});

test("close is idempotent: second close is no-op; provider session.detach called once", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "close-app", name: "Close App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.open({
    workspaceKey: "ws",
    providerId: "close-app",
    mode: "observe-only",
    initiator: "human",
  });
  const session = provider.lastSession();
  assert.ok(session);

  await controller.close({ tabId: result.tab.id });
  await controller.close({ tabId: result.tab.id }); // no-op
  await controller.close({ tabId: "never-existed" }); // no-op

  assert.equal(session.detachCalls(), 1);
  assert.equal(controller.list().tabs.length, 0);
});

test("activate: no-op on already-active tab; throws on unknown tabId", async () => {
  const provider = createFakeProvider(fullCapabilityDescriptor({ id: "act-app", name: "Act App" }));
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.open({
    workspaceKey: "ws",
    providerId: "act-app",
    mode: "observe-only",
    initiator: "human",
  });
  // 已激活 → no-op 成功
  const re = controller.activate({ tabId: result.tab.id });
  assert.equal(re.id, result.tab.id);

  // 未知 tabId → 抛错
  assert.throws(() => controller.activate({ tabId: "nope" }));
});

test("call: precheck denies before reaching session (mode-denied on observe-only agent control)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "call-app", name: "Call App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.open({
    workspaceKey: "ws",
    providerId: "call-app",
    mode: "observe-only",
    initiator: "agent",
  });

  const denied = await controller.call({
    tabId: result.tab.id,
    request: op("control", "click", "agent"),
  });
  assert.equal(denied.status, "denied");
  if (denied.status === "denied") {
    assert.equal(denied.reasonCode, "mode-denied");
  }
  // precheck 直接拒绝，session.control 不被调用。
  const session = provider.lastSession();
  assert.ok(session);
  assert.equal(session.controlCalls(), 0);
});

test("call: precheck passes → session.observe called and result returned", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "call-app", name: "Call App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.open({
    workspaceKey: "ws",
    providerId: "call-app",
    mode: "observe-only",
    initiator: "agent",
  });

  const observed = await controller.call({
    tabId: result.tab.id,
    request: op("observe", "list-windows", "agent", { filter: "all" }),
  });
  assert.equal(observed.status, "ok");
  const session = provider.lastSession();
  assert.ok(session);
  assert.equal(session.observeCalls(), 1);
  const last = session.lastObserveRequest();
  assert.ok(last);
  assert.equal(last.operation, "list-windows");
});

test("call on unknown tabId returns denied (permission-denied)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "call-app", name: "Call App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.call({
    tabId: "never-existed",
    request: op("observe", "list-windows", "agent"),
  });
  assert.equal(result.status, "denied");
  if (result.status === "denied") {
    assert.equal(result.reasonCode, "permission-denied");
  }
});

test("healthOf: unknown tabId returns detached/unreachable", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "health-app", name: "Health App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const health = controller.healthOf("never-existed");
  assert.equal(health.status, "detached");
  assert.equal(health.health, "unreachable");
});

test("open: sensitiveDataPolicy wider than descriptor needs is rejected", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "sensitive-app",
      name: "Sensitive App",
      sensitiveDataNeeds: "default-exclude",
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws",
        providerId: "sensitive-app",
        mode: "observe-only",
        initiator: "human",
        sensitiveDataPolicy: {
          scope: "task-scoped",
          allowlistWindowIds: [],
          denylistWindowIds: [],
          excludeCredentials: true,
        },
      }),
    /sensitive data policy task-scoped exceeds provider sensitive-app sensitiveDataNeeds default-exclude/,
  );
});
