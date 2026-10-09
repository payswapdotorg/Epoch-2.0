/**
 * W002 测试：引擎满足冻结 ReconstructionEngine 契约。
 *
 - isReconstructionEngine / isWellFormedReconstructionEngine 成立；
 - descriptor 形状正确（runtime=in-process，capabilities.variants=true）；
 - open/snapshot/close 行为正确；close 幂等；closed 后操作抛错；
 - subscribe 收到 revision 事件；apply(select-variant) 发出事件。
 - 引擎拒绝非 engineId 匹配的输入。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isReconstructionEngine,
  isWellFormedReconstructionEngine,
  isReconstructionEngineDescriptor,
  createReconstructionEngineRegistry,
} from "@zcode/epoch-reconstruction-contract";
import { createConstructionFixtureEngine } from "../src/index.ts";
import { CONSTRUCTION_FIXTURE_ENGINE_ID, CONSTRUCTION_FIXTURE_VARIANT_IDS } from "../src/index.ts";
import type {
  ReconstructionInput,
  ReconstructionContext,
  ReconstructionEvent,
} from "@zcode/epoch-reconstruction-contract";

const CONTEXT: ReconstructionContext = { workspaceKey: "ws-test" };

function fixtureInput(variant?: string): ReconstructionInput {
  return {
    kind: "engine-native",
    engineId: CONSTRUCTION_FIXTURE_ENGINE_ID,
    payload: variant === undefined ? {} : { variant },
  };
}

test("engine satisfies the frozen ReconstructionEngine contract", () => {
  const engine = createConstructionFixtureEngine();
  assert.equal(isReconstructionEngine(engine), true);
  assert.equal(isWellFormedReconstructionEngine(engine), true);
});

test("descriptor is well-formed and in-process with variants capability", () => {
  const engine = createConstructionFixtureEngine();
  const descriptor = engine.descriptor();
  assert.equal(isReconstructionEngineDescriptor(descriptor), true);
  assert.equal(descriptor.id, CONSTRUCTION_FIXTURE_ENGINE_ID);
  assert.equal(descriptor.runtime, "in-process");
  assert.equal(descriptor.capabilities.open, true);
  assert.equal(descriptor.capabilities.variants, true);
  assert.ok(descriptor.inputKinds.includes("engine-native"));
});

test("engine registers in the frozen registry", () => {
  const registry = createReconstructionEngineRegistry();
  const engine = createConstructionFixtureEngine();
  registry.register(engine);
  const list = registry.list();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, CONSTRUCTION_FIXTURE_ENGINE_ID);
  assert.equal(registry.get(CONSTRUCTION_FIXTURE_ENGINE_ID), engine);
});

test("open + snapshot + close work end to end", async () => {
  const engine = createConstructionFixtureEngine();
  const session = await engine.open(fixtureInput("baseline"), CONTEXT);
  const revision = await session.snapshot();
  assert.ok(revision.entities.length > 0);
  await session.close();
  await session.close(); // idempotent
});

test("snapshot after close throws", async () => {
  const engine = createConstructionFixtureEngine();
  const session = await engine.open(fixtureInput(), CONTEXT);
  await session.close();
  await assert.rejects(() => session.snapshot());
});

test("engine rejects input with mismatched engineId", async () => {
  const engine = createConstructionFixtureEngine();
  const badInput: ReconstructionInput = {
    kind: "engine-native",
    engineId: "some.other.engine",
    payload: {},
  };
  await assert.rejects(() => engine.open(badInput, CONTEXT), TypeError);
});

test("engine rejects file-path input", async () => {
  const engine = createConstructionFixtureEngine();
  const badInput: ReconstructionInput = { kind: "file-path", path: "/tmp/x.ifc" };
  await assert.rejects(() => engine.open(badInput, CONTEXT), TypeError);
});

test("open with unknown variant throws", async () => {
  const engine = createConstructionFixtureEngine();
  const badInput: ReconstructionInput = {
    kind: "engine-native",
    engineId: CONSTRUCTION_FIXTURE_ENGINE_ID,
    payload: { variant: "no-such-variant" },
  };
  await assert.rejects(() => engine.open(badInput, CONTEXT), TypeError);
});

test("apply(select-variant) emits a revision event to subscribers", async () => {
  const engine = createConstructionFixtureEngine();
  const session = await engine.open(fixtureInput("baseline"), CONTEXT);
  const events: ReconstructionEvent[] = [];
  const unsubscribe = session.subscribe?.((event) => events.push(event)) ?? (() => {});
  await session.apply({
    operationId: "op-switch",
    kind: "select-variant",
    payload: { variant: "alternate-pitched-roof" },
  });
  const revisionEvents = events.filter((event) => event.type === "revision");
  assert.ok(revisionEvents.length >= 1, "expected at least one revision event");
  unsubscribe();
  await session.close();
});

test("all declared variants open successfully", async () => {
  const engine = createConstructionFixtureEngine();
  for (const variant of CONSTRUCTION_FIXTURE_VARIANT_IDS) {
    const session = await engine.open(fixtureInput(variant), CONTEXT);
    const revision = await session.snapshot();
    assert.ok(revision.digest.length === 64);
    await session.close();
  }
});
