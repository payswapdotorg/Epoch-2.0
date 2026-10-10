/**
 * W028 验收点 1：Demonstrate a real attached or safely simulated session,
 * clearly labeling simulation.
 *
 * 断言：
 * - 通过 EnvironmentSurfaceController 打开一个 simulation=true 的 provider，
 *   attach 成功产出会话；tab.title 含 "[simulated]" 前缀；tab.simulation=true。
 * - 同时打开一个 simulation=false 的 provider，tab.title 无 "[simulated]" 前缀；
 *   tab.simulation=false。
 * - 控制器在 open 时若 provider.attach 抛错（远端 host 不可达），不静默降级为
 *   模拟——直接抛错（验收点 1 要求 simulation 必须显式，不能用模拟兜底真实失败）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EnvironmentSurfaceController } from "../../packages/epoch-environment-surface/src/index.ts";
import {
  createFakeProvider,
  createRuntimeWith,
  fullCapabilityDescriptor,
} from "./fake-provider.ts";

test("acceptance-1: simulated session is labeled with [simulated] prefix and tab.simulation=true", async () => {
  const simulated = createFakeProvider(
    fullCapabilityDescriptor({
      id: "sim-app",
      name: "Simulated App",
      simulation: true,
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([simulated]));

  const result = await controller.open({
    workspaceKey: "ws-sim",
    providerId: "sim-app",
    mode: "observe-only",
    initiator: "human",
  });

  assert.equal(result.tab.simulation, true);
  assert.match(result.tab.title, /^\[simulated\]/);
  assert.equal(result.descriptor.simulation, true);
  assert.equal(result.health.status, "attached");
  assert.equal(result.created, true);
});

test("acceptance-1: real (non-simulated) session has no [simulated] prefix and tab.simulation=false", async () => {
  const real = createFakeProvider(
    fullCapabilityDescriptor({
      id: "real-app",
      name: "Real App",
      simulation: false,
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([real]));

  const result = await controller.open({
    workspaceKey: "ws-real",
    providerId: "real-app",
    mode: "observe-only",
    initiator: "human",
  });

  assert.equal(result.tab.simulation, false);
  assert.doesNotMatch(result.tab.title, /\[simulated\]/);
  assert.equal(result.descriptor.simulation, false);
});

test("acceptance-1: attach failure is not silently downgraded to simulation (no simulation fallback)", async () => {
  const failing = createFakeProvider(
    fullCapabilityDescriptor({
      id: "failing-app",
      name: "Failing App",
      simulation: false,
      attachBehavior: () => ({ kind: "throw", error: new Error("remote host unreachable") }),
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([failing]));

  // 真实 attach 失败时控制器抛错——不静默降级到模拟会话（验收点 1）。
  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws-fail",
        providerId: "failing-app",
        mode: "observe-only",
        initiator: "human",
      }),
    /remote host unreachable/,
  );
  // 失败 attach 不应在控制器内留下 tab。
  assert.equal(controller.list().tabs.length, 0);
});
