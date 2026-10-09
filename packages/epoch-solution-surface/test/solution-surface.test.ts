/**
 * epoch-solution-surface 生命周期测试。
 *
 * 用两个 fake 重建引擎（fake-alpha / fake-beta）证明：
 * - open → activate → close → reopen 全程无引擎专属 UI/控制器代码（引擎中立）；
 * - 幂等 open：同一身份重复 open 复用既有 tab/会话，created=false；
 * - close 幂等：关闭已关闭/未知 tab 为 no-op 成功；
 * - activate/reopen 对未知 tabId 抛错；activate 已激活为 no-op；
 * - 增加第二个 fake 引擎不需要新的 surface 类型——同一个控制器、同一组操作；
 * - 持久化语义：控制器只持有稳定身份 + 可移植会话引用（ReconstructionSession），
 *   不持有任何渲染器句柄。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createReconstructionEngineRegistry,
  type ReconstructionEngine,
  type ReconstructionEngineDescriptor,
  type ReconstructionSession,
} from "../../epoch-reconstruction-contract/src/index.ts";
import {
  isSolutionOpenResult,
  isSolutionSurfaceState,
  isSolutionSurfaceTab,
  type SolutionOpenRequest,
} from "../../epoch-solution-contract/src/index.ts";
import { computeWorldDigest } from "../../epoch-world-model/src/index.ts";
import {
  SolutionSurfaceController,
  solutionSurfaceIdentityKey,
  type SolutionSurfaceIdentity,
  type SolutionSurfaceRuntime,
} from "../src/index.ts";

/**
 * fake 引擎工厂：产出确定性 WorldRevision 的重建引擎。
 *
 * 引擎中立证明：两个 fake 引擎（id 不同、world 内容不同）走完全相同的控制器路径；
 * 控制器不按 engineId 分支，只通过 registry.get(engineId) 解析。
 */
function createFakeEngine(options: {
  id: string;
  name: string;
  /** 从 input 派生稳定 solutionId（宿主侧解析；控制器不参与 input 语义）。 */
  solutionIdFromInput: (input: SolutionOpenRequest["input"]) => string;
  /** 从 solutionId 派生确定性实体标签，使两个引擎产生不同 world 摘要。 */
  entityLabelFromSolutionId: (solutionId: string) => string;
}): {
  engine: ReconstructionEngine;
  descriptor: ReconstructionEngineDescriptor;
  /** 该引擎被 open 的次数（用于验证幂等 open 不重复调用 engine.open）。 */
  openCalls: () => number;
  /** 该引擎创建的会话被 close 的次数。 */
  closeCalls: () => number;
} {
  const descriptor: ReconstructionEngineDescriptor = {
    id: options.id,
    name: options.name,
    version: "1.0.0",
    runtime: "in-process",
    inputKinds: ["file-path"],
    capabilities: {
      open: true,
      inspect: false,
      mutate: false,
      timeline: false,
      variants: false,
      measurements: false,
      simulation: false,
    },
  };
  let openCount = 0;
  let closeCount = 0;

  function createSession(solutionId: string): ReconstructionSession {
    const worldId = `${options.id}:${solutionId}`;
    const entity = {
      entityId: `${options.id}-entity-${solutionId}`,
      entityType: "column",
      label: options.entityLabelFromSolutionId(solutionId),
    };
    const revision = {
      worldId,
      revisionId: `${worldId}-rev-1`,
      digest: computeWorldDigest({ worldId, entities: [entity], relationships: [] }),
      entities: [entity],
      relationships: [],
      presentationSeed: { seed: `${worldId}-seed` },
      provenance: [],
    };
    return {
      snapshot: async () => revision,
      close: async () => {
        closeCount += 1;
      },
    };
  }

  const engine: ReconstructionEngine = {
    descriptor: () => descriptor,
    open: async (input) => {
      openCount += 1;
      const solutionId = options.solutionIdFromInput(input);
      return createSession(solutionId);
    },
  };

  return { engine, descriptor, openCalls: () => openCount, closeCalls: () => closeCount };
}

/** 组装一个挂载给定引擎的控制器运行时（DI）。 */
function createRuntime(
  engines: ReadonlyArray<{ engine: ReconstructionEngine }>,
  runtimeOverrides: Partial<SolutionSurfaceRuntime> = {},
): SolutionSurfaceRuntime {
  const registry = createReconstructionEngineRegistry();
  for (const { engine } of engines) registry.register(engine);
  return {
    registry,
    // 宿主侧 solutionId 解析器：从 file-path input 的 path 派生稳定 id。
    // 控制器不参与 input 语义——这条分支在注入的解析器里，不在控制器里。
    resolveSolutionId: (request) =>
      request.input.kind === "file-path" ? request.input.path : undefined,
    ...runtimeOverrides,
  };
}

function filePathInput(path: string): SolutionOpenRequest["input"] {
  return { kind: "file-path", path };
}

test("open creates a first-class solution surface tab and returns a valid open result", async () => {
  const fake = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([fake]));

  const result = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-A.fixture.json"),
    title: "Site A",
  });

  assert.equal(result.created, true);
  assert.equal(isSolutionOpenResult(result), true);
  assert.equal(isSolutionSurfaceTab(result.tab), true);
  assert.equal(result.tab.type, "solution");
  assert.equal(result.tab.workspaceKey, "ws-1");
  assert.equal(result.tab.engineId, "fake-alpha");
  assert.equal(result.tab.solutionId, "/models/site-A.fixture.json");
  assert.equal(result.tab.title, "Site A");
  assert.equal(result.engine.id, "fake-alpha");
  assert.equal(fake.openCalls(), 1);
});

test("open is idempotent for the same identity (reuses tab/session, created=false)", async () => {
  const fake = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([fake]));

  const first = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-A.fixture.json"),
  });
  const second = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-A.fixture.json"),
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.tab.id, first.tab.id);
  assert.equal(second.tab.sessionId, first.tab.sessionId);
  assert.equal(second.tab.solutionId, first.tab.solutionId);
  // 幂等：重复 open 不再调用 engine.open。
  assert.equal(fake.openCalls(), 1);
});

test("open distinguishes identities by workspaceKey/engineId/solutionId", async () => {
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const beta = createFakeEngine({
    id: "fake-beta",
    name: "Fake Beta",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `beta-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([alpha, beta]));

  const a = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-A.fixture.json"),
  });
  const b = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-beta",
    input: filePathInput("/models/site-A.fixture.json"),
  });
  const aOtherWs = await controller.open({
    workspaceKey: "ws-2",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-A.fixture.json"),
  });

  assert.notEqual(a.tab.id, b.tab.id);
  assert.notEqual(a.tab.id, aOtherWs.tab.id);
  assert.equal(alpha.openCalls(), 2);
  assert.equal(beta.openCalls(), 1);
});

test("activate then close then reopen lifecycle works with no engine-specific code", async () => {
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([alpha]));

  const opened = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-B.fixture.json"),
  });

  // activate：已激活 tab 为 no-op 成功，返回同一 tab。
  const activated = controller.activate({ tabId: opened.tab.id });
  assert.equal(activated.id, opened.tab.id);
  assert.equal(controller.activate({ tabId: opened.tab.id }).id, opened.tab.id);

  // list：纯读，返回活动 tab。
  const listed = controller.list();
  assert.equal(isSolutionSurfaceState(listed), true);
  assert.equal(listed.tabs.length, 1);
  assert.equal(listed.activeTabId, opened.tab.id);

  // close：释放会话资源，幂等。
  await controller.close({ tabId: opened.tab.id });
  assert.equal(alpha.closeCalls(), 1);
  await controller.close({ tabId: opened.tab.id }); // 已关闭 → no-op 成功
  assert.equal(alpha.closeCalls(), 1);
  assert.equal(controller.list().tabs.length, 0);

  // reopen：未知 tabId（已关闭）抛错（控制器层 reopen 是对仍打开 tab 的幂等再激活）。
  assert.throws(() => controller.reopen({ tabId: opened.tab.id }));
});

test("reopen an open tab returns it as-is and re-activates", async () => {
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([alpha]));

  const first = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-C.fixture.json"),
  });
  // 打开第二个 tab 使活动 tab 不再是 first。
  const second = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-D.fixture.json"),
  });
  assert.equal(controller.list().activeTabId, second.tab.id);

  // reopen 第一个 tab：原样返回并激活。
  const reopened = controller.reopen({ tabId: first.tab.id });
  assert.equal(reopened.id, first.tab.id);
  assert.equal(reopened.solutionId, first.tab.solutionId);
  assert.equal(controller.list().activeTabId, first.tab.id);
});

test("activate/reopen throw on unknown tabId", async () => {
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([alpha]));

  assert.throws(() => controller.activate({ tabId: "nope" }));
  assert.throws(() => controller.reopen({ tabId: "nope" }));
});

test("open throws on unknown engineId (registry is the only discovery path; no silent fallback)", async () => {
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: () => "sol",
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([alpha]));

  await assert.rejects(() =>
    controller.open({
      workspaceKey: "ws-1",
      engineId: "not-registered",
      input: filePathInput("/models/x.fixture.json"),
    }),
  );
});

test("open throws when neither request.solutionId nor runtime.resolveSolutionId yields a stable id", async () => {
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: () => "sol",
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  // 运行时不提供 resolveSolutionId；input 是 engine-native（不携带可派生 solutionId 的字段）。
  // 幂等 open 必须有稳定身份——控制器拒绝在身份不明时打开。
  const registry = createReconstructionEngineRegistry();
  registry.register(alpha.engine);
  const controller = new SolutionSurfaceController({ registry });

  await assert.rejects(() =>
    controller.open({
      workspaceKey: "ws-1",
      engineId: "fake-alpha",
      input: { kind: "engine-native", engineId: "fake-alpha", payload: { x: 1 } },
    }),
  );
});

test("adding a second reconstruction engine requires no new surface type (engine-agnostic)", async () => {
  // 同一个控制器、同一组操作，挂载两个 fake 引擎——证明「one surface, many engines」。
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const beta = createFakeEngine({
    id: "fake-beta",
    name: "Fake Beta",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `beta-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([alpha, beta]));

  const a = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-E.fixture.json"),
  });
  const b = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-beta",
    input: filePathInput("/models/site-E.fixture.json"),
  });

  assert.equal(a.engine.id, "fake-alpha");
  assert.equal(b.engine.id, "fake-beta");
  assert.notEqual(a.tab.id, b.tab.id);
  // 两个引擎的 world 摘要不同（entity 标签不同）。
  assert.notEqual(a.revision.digest, b.revision.digest);

  const listed = controller.list();
  assert.equal(listed.tabs.length, 2);
  // 控制器层未引入新 surface 类型：两个 tab 的 type 都是 "solution"。
  assert.equal(
    listed.tabs.every((tab) => tab.type === "solution"),
    true,
  );
});

test("identity key is stable across equal identities and differs across unequal ones", () => {
  const a: SolutionSurfaceIdentity = {
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    solutionId: "sol-1",
  };
  const aDup: SolutionSurfaceIdentity = {
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    solutionId: "sol-1",
  };
  const b: SolutionSurfaceIdentity = {
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    solutionId: "sol-2",
  };
  assert.equal(solutionSurfaceIdentityKey(a), solutionSurfaceIdentityKey(aDup));
  assert.notEqual(solutionSurfaceIdentityKey(a), solutionSurfaceIdentityKey(b));
});

test("controller holds only stable identity + portable session refs (no renderer handles)", async () => {
  const alpha = createFakeEngine({
    id: "fake-alpha",
    name: "Fake Alpha",
    solutionIdFromInput: (input) => (input.kind === "file-path" ? input.path : "sol"),
    entityLabelFromSolutionId: (sol) => `alpha-${sol}`,
  });
  const controller = new SolutionSurfaceController(createRuntime([alpha]));

  const result = await controller.open({
    workspaceKey: "ws-1",
    engineId: "fake-alpha",
    input: filePathInput("/models/site-F.fixture.json"),
  });

  // tab 是纯身份（可序列化；不含函数/句柄）。
  const serialized = JSON.stringify(result.tab);
  assert.match(serialized, /"type":"solution"/);
  assert.doesNotMatch(serialized, /function|scene|mesh|babylon|three/i);
  // list 返回的 tabs 也是纯身份。
  const listed = controller.list();
  assert.equal(isSolutionSurfaceState(listed), true);
});
