/**
 * W028 验收点 4：Read/observe permission never implicitly grants mutation.
 *
 * 断言：
 * - observe-only 模式下 agent 调用 control/semantic 永远返回
 *   denied(reason=mode-denied)——即使 descriptor 声明该 plane available=true。
 * - observe-only 模式下 agent 调用 observe 成功（observe 不受限）。
 * - suggest 模式下 agent 调用 control 也被拒绝（suggest 模式 agent 不能直接
 *   调 control plane，必须经人类确认 → 验收点 3+4 交叉的强制门控）。
 * - descriptor 声明某 plane available=false 时，control 调用被拒绝
 *   (reason=capability-unavailable)，与 mode 门控正交（验收点 7 的源 gap 子集）。
 * - 描述符未声明的 operation（不在 plane.operations 列表中）被拒绝
 *   (reason=not-supported)。
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

test("acceptance-4: observe-only agent cannot call control or semantic (mode-denied even when capability available)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "strict-app", name: "Strict App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const session = await controller.open({
    workspaceKey: "ws-strict",
    providerId: "strict-app",
    mode: "observe-only",
    initiator: "agent",
  });

  // observe 成功——observe plane 不受 mode 限制。
  const observeResult = await controller.call({
    tabId: session.tab.id,
    request: op("observe", "list-windows", "agent"),
  });
  assert.equal(observeResult.status, "ok");

  // control 被拒绝——验收点 4 核心：observe-only 永不隐式授予 control。
  const controlResult = await controller.call({
    tabId: session.tab.id,
    request: op("control", "click", "agent"),
  });
  assert.equal(controlResult.status, "denied");
  if (controlResult.status === "denied") {
    assert.equal(controlResult.reasonCode, "mode-denied");
  }

  // semantic 也被拒绝——同样道理。
  const semanticResult = await controller.call({
    tabId: session.tab.id,
    request: op("semantic", "bind-entity", "agent"),
  });
  assert.equal(semanticResult.status, "denied");
  if (semanticResult.status === "denied") {
    assert.equal(semanticResult.reasonCode, "mode-denied");
  }
});

test("acceptance-4: suggest mode also blocks agent control (suggest = agent must propose, human confirms; no direct mutation)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "suggest-app", name: "Suggest App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const session = await controller.open({
    workspaceKey: "ws-suggest",
    providerId: "suggest-app",
    mode: "suggest",
    initiator: "agent",
  });

  const controlResult = await controller.call({
    tabId: session.tab.id,
    request: op("control", "click", "agent"),
  });
  assert.equal(controlResult.status, "denied");
  if (controlResult.status === "denied") {
    assert.equal(controlResult.reasonCode, "mode-denied");
  }
});

test("acceptance-4: unavailable plane (available=false) denies agent AND human (orthogonal to mode; capability gap)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "gap-app",
      name: "Gap App",
      planes: [
        { plane: "observe", operations: ["list-windows"], available: true },
        { plane: "control", operations: ["click"], available: false },
        { plane: "semantic", operations: ["bind-entity"], available: true },
      ],
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const session = await controller.open({
    workspaceKey: "ws-gap",
    providerId: "gap-app",
    mode: "full",
    initiator: "human",
  });

  // full 模式 + human initiator 都不能旁路 available=false——验收点 7 的
  // source-gap / unsupported-signal 子集；也强化验收点 4 的「observe 不隐式
  // 授予 mutation」：即使 mode=full，capability gap 仍拒绝。
  const result = await controller.call({
    tabId: session.tab.id,
    request: op("control", "click", "human"),
  });
  assert.equal(result.status, "denied");
  if (result.status === "denied") {
    assert.equal(result.reasonCode, "capability-unavailable");
  }
});

test("acceptance-4: not-declared operation is rejected (not-supported; descriptor is the truth)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "declared-app", name: "Declared App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const session = await controller.open({
    workspaceKey: "ws-declared",
    providerId: "declared-app",
    mode: "full",
    initiator: "human",
  });

  const result = await controller.call({
    tabId: session.tab.id,
    request: op("control", "nonexistent-operation", "human"),
  });
  assert.equal(result.status, "denied");
  if (result.status === "denied") {
    assert.equal(result.reasonCode, "not-supported");
  }
});
