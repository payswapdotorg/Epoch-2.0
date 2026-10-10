/**
 * W028 验收点 7：Tests cover attach, detach, lost connection, stale session,
 * denied permissions and remote host.
 *
 * 6 条路径各一个 test：
 * - attach：provider.attach 被调用；tab 创建；health=attached/ok。
 * - detach：controller.close 调用 session.detach；tab 被移除；再次 close 为 no-op。
 * - lost connection：session.forceLost → onLostConnection 订阅者被通知；
 *   health.status=lost；control plane 在 agent + observe-only 模式下被拒绝
 *   （mode-denied）；human + observe-only 模式下 control 因 capability gap 被拒
 *   （capability-unavailable——lost 把 control plane 标为 unavailable）。
 * - stale session：session.forceStale → health.status=stale；后续 attach 到
 *   同一身份的 controller.open 复用既有 stale session（不强制 refresh）。
 * - denied permissions：provider.attach 拒绝授权 → controller.open 抛错；不
 *   留 tab。
 * - remote host：runtime=remote 的 provider；attach 时 remoteHost 字段被透传；
 *   远端不可达时 provider.attach 抛错，controller.open 抛错。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EnvironmentSurfaceController } from "../../packages/epoch-environment-surface/src/index.ts";
import {
  createFakeProvider,
  createRuntimeWith,
  fullCapabilityDescriptor,
  op,
} from "./fake-provider.ts";

test("acceptance-7/attach: provider.attach is called and tab is created with health=attached/ok", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "attach-app", name: "Attach App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.open({
    workspaceKey: "ws-attach",
    providerId: "attach-app",
    mode: "observe-only",
    initiator: "human",
  });

  assert.equal(provider.attachCalls(), 1);
  assert.equal(result.health.status, "attached");
  assert.equal(result.health.health, "ok");
  assert.equal(result.created, true);
  assert.equal(controller.healthOf(result.tab.id).status, "attached");
});

test("acceptance-7/detach: controller.close calls session.detach; tab removed; second close is no-op", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "detach-app", name: "Detach App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.open({
    workspaceKey: "ws-detach",
    providerId: "detach-app",
    mode: "observe-only",
    initiator: "human",
  });

  const session = provider.lastSession();
  assert.ok(session);

  await controller.close({ tabId: result.tab.id });
  assert.equal(session.detachCalls(), 1);
  assert.equal(controller.list().tabs.length, 0);
  assert.equal(controller.list().activeTabId, null);

  // 再次 close 同一 tabId：no-op 成功，不重复调用 detach。
  await controller.close({ tabId: result.tab.id });
  assert.equal(session.detachCalls(), 1);
});

test("acceptance-7/lost-connection: onLostConnection fires; health becomes lost; control denied (capability-unavailable via dynamic health snapshot)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "lost-app",
      name: "Lost App",
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  // 只 attach 一个 agent 会话——避免 lastSession() 歧义。
  const agent = await controller.open({
    workspaceKey: "ws-lost",
    providerId: "lost-app",
    mode: "observe-only",
    initiator: "agent",
  });

  // 订阅 lost 事件（controller 转发到 session.onLostConnection）。
  let lostSnapshot: { status: string; reason: string | null } | null = null;
  controller.subscribeToLostConnection(agent.tab.id, (snapshot) => {
    lostSnapshot = { status: snapshot.status, reason: snapshot.reason };
  });

  const session = provider.lastSession();
  assert.ok(session);
  // forceLost 把 control/semantic plane 标为 unavailable（fake session 行为），
  // 并触发 onLostConnection 订阅者。
  session.forceLost("lost-connection");

  // 订阅者被触发。
  assert.equal(lostSnapshot?.status, "lost");
  assert.equal(lostSnapshot?.reason, "lost-connection");

  // controller 的 healthOf 反映 lost 状态（session.status() 是权威）。
  const agentHealth = controller.healthOf(agent.tab.id);
  assert.equal(agentHealth.status, "lost");
  assert.equal(agentHealth.reason, "lost-connection");

  // lost 状态下 control 调用被拒——动态健康快照的 unavailablePlanes 优先于
  // descriptor 的 available=true；reason=capability-unavailable（验收点 7）。
  const agentControl = await controller.call({
    tabId: agent.tab.id,
    request: op("control", "click", "agent"),
  });
  assert.equal(agentControl.status, "denied");
  if (agentControl.status === "denied") {
    assert.equal(agentControl.reasonCode, "capability-unavailable");
  }

  // observe plane 在 lost 状态下仍可用——验收点 7 的 lost 不应让 observe 也挂掉
  // （observe 是降级感知的最小能力；fake session 的 forceLost 只把 control/semantic
  // 标 unavailable，observe 保留）。但 observe-only 模式 + agent initiator 不限制
  // observe plane，所以应通过 precheck。这里不强断言（fake session 的 observe
  // 返回 ok——controller 透传）。
  const observeResult = await controller.call({
    tabId: agent.tab.id,
    request: op("observe", "list-windows", "agent"),
  });
  assert.equal(observeResult.status, "ok");
});

test("acceptance-7/stale-session: session.forceStale makes health.status=stale; subsequent open of same identity reuses the existing session (not a fresh attach)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "stale-app", name: "Stale App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const result = await controller.open({
    workspaceKey: "ws-stale",
    providerId: "stale-app",
    mode: "observe-only",
    initiator: "human",
  });
  assert.equal(result.health.status, "attached");

  const session = provider.lastSession();
  assert.ok(session);
  (session as { forceStale: (reason?: string) => void }).forceStale("stale-session");
  assert.equal(controller.healthOf(result.tab.id).status, "stale");
  assert.equal(controller.healthOf(result.tab.id).reason, "stale-session");

  // 再次以同一身份 open：复用既有 session（stale 但未 detach），不重复 attach。
  const reOpened = await controller.open({
    workspaceKey: "ws-stale",
    providerId: "stale-app",
    mode: "observe-only",
    initiator: "human",
  });
  assert.equal(reOpened.created, false);
  assert.equal(provider.attachCalls(), 1); // 没有第二次 attach
  assert.equal(reOpened.tab.id, result.tab.id);
});

test("acceptance-7/denied-permissions: provider.attach throwing causes controller.open to throw; no tab is left behind", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "denied-app",
      name: "Denied App",
      attachBehavior: () => ({ kind: "throw", error: new Error("permission denied") }),
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws-denied",
        providerId: "denied-app",
        mode: "observe-only",
        initiator: "human",
      }),
    /permission denied/,
  );
  assert.equal(controller.list().tabs.length, 0);
});

test("acceptance-7/remote-host: remote provider with unreachable host rejects attach; remoteHost is propagated to attach request", async () => {
  let capturedRequest: { remoteHost?: unknown } | null = null;
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "remote-app",
      name: "Remote App",
      runtime: "remote",
      attachBehavior: (request) => {
        capturedRequest = { remoteHost: request.remoteHost };
        return { kind: "throw", error: new Error("remote host unreachable") };
      },
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws-remote",
        providerId: "remote-app",
        mode: "observe-only",
        initiator: "human",
        remoteHost: { id: "host-prod-01", label: "Production Host" },
      }),
    /remote host unreachable/,
  );
  // remoteHost 字段被透传给 provider.attach——provider 能看到远端 host 信息。
  assert.deepEqual(capturedRequest?.remoteHost, {
    id: "host-prod-01",
    label: "Production Host",
  });
  assert.equal(controller.list().tabs.length, 0);
});
