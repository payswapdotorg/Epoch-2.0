/**
 * W009 测试：引擎满足冻结 ReconstructionEngine 契约。
 *
 * - isReconstructionEngine / isWellFormedReconstructionEngine 成立；
 * - descriptor 形状正确（runtime=in-process，capabilities.open=true，mutate=false）；
 * - open/snapshot/close 行为正确；close 幂等；closed 后操作抛错；
 * - 引擎拒绝 engine-native 输入（IFC 是开放格式，不接受引擎原生值泄漏）；
 * - 引擎在 registry 中可注册（discovery 路径有效）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  isReconstructionEngine,
  isWellFormedReconstructionEngine,
  isReconstructionEngineDescriptor,
  createReconstructionEngineRegistry,
} from "@zcode/epoch-reconstruction-contract";
import { createIfcReconstructionEngine, IFC_RECONSTRUCTION_ENGINE_ID } from "../src/index.ts";
import type {
  ReconstructionInput,
  ReconstructionContext,
} from "@zcode/epoch-reconstruction-contract";

const CONTEXT: ReconstructionContext = { workspaceKey: "ws-ifc-test" };

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/pump-house.ifc",
);

test("engine satisfies the frozen ReconstructionEngine contract", () => {
  const engine = createIfcReconstructionEngine();
  assert.equal(isReconstructionEngine(engine), true);
  assert.equal(isWellFormedReconstructionEngine(engine), true);
});

test("descriptor is well-formed and in-process with measurements capability", () => {
  const engine = createIfcReconstructionEngine();
  const descriptor = engine.descriptor();
  assert.equal(isReconstructionEngineDescriptor(descriptor), true);
  assert.equal(descriptor.id, IFC_RECONSTRUCTION_ENGINE_ID);
  assert.equal(descriptor.runtime, "in-process");
  assert.equal(descriptor.capabilities.open, true);
  assert.equal(descriptor.capabilities.inspect, true);
  assert.equal(descriptor.capabilities.measurements, true);
  assert.equal(descriptor.capabilities.mutate, false);
  assert.equal(descriptor.capabilities.variants, false);
  assert.ok(descriptor.inputKinds.includes("file-path"));
  assert.ok(descriptor.inputKinds.includes("byte-reference"));
});

test("engine registers in the frozen registry", () => {
  const registry = createReconstructionEngineRegistry();
  const engine = createIfcReconstructionEngine();
  registry.register(engine);
  const list = registry.list();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, IFC_RECONSTRUCTION_ENGINE_ID);
  assert.equal(registry.get(IFC_RECONSTRUCTION_ENGINE_ID), engine);
});

test("open + snapshot + close work end to end", async () => {
  const engine = createIfcReconstructionEngine();
  const input: ReconstructionInput = { kind: "file-path", path: FIXTURE_PATH };
  const session = await engine.open(input, CONTEXT);
  const revision = await session.snapshot();
  assert.ok(revision.entities.length > 0);
  await session.close();
  await session.close(); // idempotent
});

test("snapshot after close throws", async () => {
  const engine = createIfcReconstructionEngine();
  const input: ReconstructionInput = { kind: "file-path", path: FIXTURE_PATH };
  const session = await engine.open(input, CONTEXT);
  await session.close();
  await assert.rejects(() => session.snapshot());
});

test("engine rejects engine-native input (IFC is an open format)", async () => {
  const engine = createIfcReconstructionEngine();
  const badInput: ReconstructionInput = {
    kind: "engine-native",
    engineId: IFC_RECONSTRUCTION_ENGINE_ID,
    payload: {},
  };
  await assert.rejects(() => engine.open(badInput, CONTEXT), TypeError);
});

test("engine rejects engine-native input with mismatched engineId", async () => {
  const engine = createIfcReconstructionEngine();
  const badInput: ReconstructionInput = {
    kind: "engine-native",
    engineId: "some.other.engine",
    payload: {},
  };
  await assert.rejects(() => engine.open(badInput, CONTEXT), TypeError);
});

test("engine rejects missing file path", async () => {
  const engine = createIfcReconstructionEngine();
  const badInput: ReconstructionInput = { kind: "file-path", path: "/no/such/file.ifc" };
  await assert.rejects(() => engine.open(badInput, CONTEXT));
});

test("session does not expose apply (mutate=false, no second semantic authority)", async () => {
  const engine = createIfcReconstructionEngine();
  const input: ReconstructionInput = { kind: "file-path", path: FIXTURE_PATH };
  const session = await engine.open(input, CONTEXT);
  // W009 engine declares mutate=false; apply is intentionally NOT implemented.
  // The session object simply does not offer apply — assert it is undefined.
  assert.equal((session as { apply?: unknown }).apply, undefined);
  assert.equal((session as { subscribe?: unknown }).subscribe, undefined);
  await session.close();
});
