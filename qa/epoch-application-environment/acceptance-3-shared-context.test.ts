/**
 * W028 验收点 3：Human and agent share task/session context with distinct
 * initiators and permissions.
 *
 * 断言：
 * - 同一 workspace + providerId + ownerTaskId 下，initiator=human 与
 *   initiator=agent 是两个不同的会话（身份键不同；两次 open 都 created=true）。
 * - 两个会话共享 ownerTaskId（验收点 3 的 task/session context 共享语义）。
 * - initiator=human 在 observe-only 模式下可以发起 control 操作（mode 不限制
 *   human initiator）；initiator=agent 在 observe-only 模式下被拒绝。
 *   —— 验收点 3+4 的交叉：human 与 agent 有不同 permissions。
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

test("acceptance-3: human and agent with same task get distinct sessions (different identity keys, both created=true)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "shared-app", name: "Shared App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const human = await controller.open({
    workspaceKey: "ws-shared",
    providerId: "shared-app",
    mode: "observe-only",
    initiator: "human",
    ownerTaskId: "task-001",
  });
  const agent = await controller.open({
    workspaceKey: "ws-shared",
    providerId: "shared-app",
    mode: "observe-only",
    initiator: "agent",
    ownerTaskId: "task-001",
  });

  // 共享 task/session context（ownerTaskId 相同）。
  assert.equal(human.tab.ownerTaskId, "task-001");
  assert.equal(agent.tab.ownerTaskId, "task-001");
  // 但 initiator 不同 → 身份键不同 → 两个不同会话。
  assert.notEqual(human.tab.id, agent.tab.id);
  assert.notEqual(human.tab.sessionId, agent.tab.sessionId);
  assert.equal(human.tab.initiator, "human");
  assert.equal(agent.tab.initiator, "agent");
  assert.equal(human.created, true);
  assert.equal(agent.created, true);
  assert.equal(controller.list().tabs.length, 2);
});

test("acceptance-3+4: human in observe-only mode CAN call control; agent in observe-only mode CANNOT", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "shared-app", name: "Shared App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const human = await controller.open({
    workspaceKey: "ws-shared",
    providerId: "shared-app",
    mode: "observe-only",
    initiator: "human",
    ownerTaskId: "task-001",
  });
  const agent = await controller.open({
    workspaceKey: "ws-shared",
    providerId: "shared-app",
    mode: "observe-only",
    initiator: "agent",
    ownerTaskId: "task-001",
  });

  // human 调用 control：mode 不限制 human initiator，应成功（验收点 3+4 交叉）。
  const humanControl = await controller.call({
    tabId: human.tab.id,
    request: op("control", "click", "human", { x: 10, y: 20 }),
  });
  assert.equal(humanControl.status, "ok");

  // agent 调用 control：observe-only 模式拒绝 agent 访问 control plane（验收点 4）。
  const agentControl = await controller.call({
    tabId: agent.tab.id,
    request: op("control", "click", "agent", { x: 10, y: 20 }),
  });
  assert.equal(agentControl.status, "denied");
  if (agentControl.status === "denied") {
    assert.equal(agentControl.reasonCode, "mode-denied");
  }
});

test("acceptance-3: agent in confirmation mode CAN call control (mode + initiator permission rule)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "shared-app", name: "Shared App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const agent = await controller.open({
    workspaceKey: "ws-shared",
    providerId: "shared-app",
    mode: "confirmation",
    initiator: "agent",
    ownerTaskId: "task-001",
  });

  // confirmation 模式下 agent 可以发起 control（mode + capability 双重门控通过）。
  const agentControl = await controller.call({
    tabId: agent.tab.id,
    request: op("control", "click", "agent", { x: 10, y: 20 }),
  });
  assert.equal(agentControl.status, "ok");
});
