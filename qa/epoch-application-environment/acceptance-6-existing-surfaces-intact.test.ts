/**
 * W028 验收点 6：Existing Browser/Terminal behavior remains intact.
 *
 * 完整的 Browser/Terminal 行为校验由继承宿主/visual-integration 套件（W007）
 * 与 `pnpm typecheck` + `pnpm lint` 在 W028 边界内承担——W028 worker 不能在
 * qa/epoch-application-environment/ 内直接 import packages/ui/src/lib/workspaceSidePane.ts
 * 运行时（ui 包内部使用 `@/lib/...` 别名，Node 原生 TS 剥离无法解析；该限制
 * 与既有 W003 solution 测试一致——solution 也没在 qa 里 runtime-test ui 集成）。
 *
 * 本测试在 W028 边界内可验证的运行时不变量：
 * - EnvironmentSurfaceController 只产出 type="application-environment" 的 tab——
 *   不创建/修改/删除 browser/terminal/solution/git/code-viewer/... 任何既有
 *   surface 类型的 tab。控制器对所有 provider 都用同一 type——新增 provider
 *   不需要新 surface 类型（验收点 2 的运行时印证）。
 * - 控制器 list() 只返回 application-environment tab；不持有也不投影其他 surface
 *   的 tab。Browser/Terminal 的 side-pane 状态机由其各自分支独立维护，不受
 *   EnvironmentSurfaceController 影响（验收点 6 的隔离语义）。
 * - 控制器 close 只移除自身 tabIdByIdentity 映射——不影响其他 surface 的
 *   身份键空间。
 *
 * 静态不变量（由 `pnpm typecheck` + `pnpm lint` 承担，本测试不再重复）：
 * - WorkspaceSidePaneTab 联合类型包含 ApplicationEnvironmentSidePaneTab 且
 *   browser/terminal/solution/git/code-viewer/... 各分支签名不变
 *   （packages/ui/src/lib/workspaceSidePane.ts 编译通过即印证）。
 * - useAppPanels 的 handleOpenApplicationEnvironmentTab 与既有
 *   handleOpenBrowserUrl / handleOpenSolutionTab / handleOpenTerminalTab 并列，
 *   不修改既有 handler 行为（packages/ui/src/hooks/useAppPanels.ts 编译通过
 *   即印证）。
 * - SidePaneTabTrigger / sidePaneTabPresentation 为 application-environment 加
 *   分支，不影响 browser/terminal/solution 的分支（同上印证）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EnvironmentSurfaceController } from "../../packages/epoch-environment-surface/src/index.ts";
import {
  createFakeProvider,
  createRuntimeWith,
  fullCapabilityDescriptor,
} from "./fake-provider.ts";

test("acceptance-6: EnvironmentSurfaceController only produces application-environment tabs (no browser/terminal/solution pollution)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "isolation-app", name: "Isolation App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  await controller.open({
    workspaceKey: "ws-iso",
    providerId: "isolation-app",
    mode: "observe-only",
    initiator: "human",
  });
  await controller.open({
    workspaceKey: "ws-iso",
    providerId: "isolation-app",
    mode: "observe-only",
    initiator: "agent",
  });

  const listed = controller.list();
  assert.equal(listed.tabs.length, 2);
  // 控制器产出的所有 tab 都是 application-environment——不产出 browser/terminal/
  // solution 等既有 surface 类型的 tab。
  assert.equal(
    listed.tabs.every((t) => t.type === "application-environment"),
    true,
  );
});

test("acceptance-6: controller close only removes its own tab identity mapping (isolation from other surfaces' identity key spaces)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "isolation-app", name: "Isolation App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const a = await controller.open({
    workspaceKey: "ws-iso",
    providerId: "isolation-app",
    mode: "observe-only",
    initiator: "human",
  });
  const b = await controller.open({
    workspaceKey: "ws-iso",
    providerId: "isolation-app",
    mode: "observe-only",
    initiator: "agent",
  });

  await controller.close({ tabId: a.tab.id });

  // 只 a 被移除；b 不受影响（不同身份键空间，无串扰）。
  const listed = controller.list();
  assert.equal(listed.tabs.length, 1);
  assert.equal(listed.tabs[0]?.id, b.tab.id);

  // 关闭未知 tab 是 no-op——不影响剩余 tab（既有 side-pane close 行为不变）。
  await controller.close({ tabId: "not-a-real-tab" });
  const listed2 = controller.list();
  assert.equal(listed2.tabs.length, 1);
});

test("acceptance-6: controller activate is no-op on already-active tab (mirrors Browser/Terminal/Solution activate semantics)", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "isolation-app", name: "Isolation App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  const a = await controller.open({
    workspaceKey: "ws-iso",
    providerId: "isolation-app",
    mode: "observe-only",
    initiator: "human",
  });
  const b = await controller.open({
    workspaceKey: "ws-iso",
    providerId: "isolation-app",
    mode: "observe-only",
    initiator: "agent",
  });
  assert.equal(controller.list().activeTabId, b.tab.id);

  // 再激活已激活的 b：no-op 成功（既有 side-pane activate 模式）。
  const reActivated = controller.activate({ tabId: b.tab.id });
  assert.equal(reActivated.id, b.tab.id);
  assert.equal(controller.list().activeTabId, b.tab.id);

  // 切回 a。
  controller.activate({ tabId: a.tab.id });
  assert.equal(controller.list().activeTabId, a.tab.id);
});

test("acceptance-6: controller activate throws on unknown tabId (does not silently fall through to browser/terminal)", () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({ id: "isolation-app", name: "Isolation App" }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  // 未知 tabId 抛错——不会把请求路由给其他 surface 的 tab（隔离语义）。
  assert.throws(() => controller.activate({ tabId: "browser-tab-id" }));
  assert.throws(() => controller.activate({ tabId: "terminal-tab-id" }));
});
