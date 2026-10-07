/**
 * epoch-reconstruction-contract 契约测试：描述符/输入/上下文/事件守卫。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWorldDigest } from "../../epoch-world-model/src/index.ts";
import {
  isReconstructionContext,
  isReconstructionEngineCapabilities,
  isReconstructionEngineDescriptor,
  isReconstructionEvent,
  isReconstructionInput,
  isReconstructionInputKind,
  isReconstructionOperation,
  isReconstructionRuntime,
} from "../src/index.ts";

const validDescriptor = {
  id: "epoch-fixture",
  name: "Epoch Fixture Engine",
  version: "1.0.0",
  runtime: "in-process",
  inputKinds: ["file-path", "engine-native"],
  capabilities: {
    open: true,
    inspect: true,
    mutate: false,
    timeline: false,
    variants: false,
    measurements: true,
    simulation: false,
  },
};

const validEntity = {
  entityId: "column-001",
  entityType: "column",
  label: "Column C1",
  quantity: { value: 0.576, unit: "m3" },
};

const revisionDigest = computeWorldDigest({
  worldId: "world-001",
  entities: [validEntity],
  relationships: [],
  provenance: [{ sourceId: "fixture", kind: "fixture" }],
});

const validRevision = {
  worldId: "world-001",
  revisionId: "rev-001",
  digest: revisionDigest,
  entities: [validEntity],
  relationships: [],
  presentationSeed: { seed: "seed-001" },
  provenance: [{ sourceId: "fixture", kind: "fixture" }],
};

test("isReconstructionEngineDescriptor accepts a valid descriptor", () => {
  assert.equal(isReconstructionEngineDescriptor(validDescriptor), true);
});

test("isReconstructionEngineDescriptor rejects missing/wrong fields", () => {
  const { id, ...withoutId } = validDescriptor;
  assert.equal(isReconstructionEngineDescriptor(withoutId), false);
  assert.equal(isReconstructionEngineDescriptor({ ...validDescriptor, id: "" }), false);
  assert.equal(isReconstructionEngineDescriptor({ ...validDescriptor, name: 5 }), false);
  assert.equal(isReconstructionEngineDescriptor({ ...validDescriptor, version: null }), false);
  assert.equal(isReconstructionEngineDescriptor(null), false);
  assert.equal(isReconstructionEngineDescriptor("engine"), false);
});

test("isReconstructionEngineDescriptor rejects bad runtime values", () => {
  assert.equal(isReconstructionEngineDescriptor({ ...validDescriptor, runtime: "cloud" }), false);
  assert.equal(isReconstructionEngineDescriptor({ ...validDescriptor, runtime: "in process" }), false);
});

test("isReconstructionRuntime accepts the four frozen boundaries", () => {
  for (const runtime of ["in-process", "worker", "process", "remote"]) {
    assert.equal(isReconstructionRuntime(runtime), true);
  }
  assert.equal(isReconstructionRuntime("daemon"), false);
});

test("isReconstructionEngineCapabilities validates the seven switches", () => {
  assert.equal(isReconstructionEngineCapabilities(validDescriptor.capabilities), true);
  assert.equal(
    isReconstructionEngineCapabilities({ ...validDescriptor.capabilities, open: "yes" }),
    false,
  );
  const { simulation, ...withoutSimulation } = validDescriptor.capabilities;
  assert.equal(isReconstructionEngineCapabilities(withoutSimulation), false);
  assert.equal(isReconstructionEngineCapabilities(null), false);
});

test("isReconstructionInput accepts all five classified kinds", () => {
  const inputs = [
    { kind: "file-path", path: "/models/site.ifc", formatHint: "ifc" },
    { kind: "byte-reference", reference: "bytes://abc", byteLength: 1024 },
    { kind: "workspace-artifact", workspaceKey: "ws-1", artifactPath: "artifacts/site.ifc" },
    { kind: "remote-resource", uri: "https://example.com/model.ifc" },
    { kind: "engine-native", engineId: "blender", payload: { scene: "stub" } },
  ];
  for (const input of inputs) {
    assert.equal(isReconstructionInput(input), true, `kind=${String(input.kind)}`);
  }
});

test("isReconstructionInput rejects unknown kinds and malformed variants", () => {
  assert.equal(isReconstructionInput({ kind: "database-row", id: "1" }), false);
  assert.equal(isReconstructionInput({ kind: "file-path", path: "" }), false);
  assert.equal(isReconstructionInput({ kind: "file-path" }), false);
  assert.equal(isReconstructionInput({ kind: "workspace-artifact", workspaceKey: "ws" }), false);
  assert.equal(isReconstructionInput({ kind: "remote-resource", uri: 7 }), false);
  assert.equal(isReconstructionInput({ kind: "engine-native", payload: {} }), false);
  assert.equal(isReconstructionInput(null), false);
  assert.equal(isReconstructionInput("file"), false);
});

test("isReconstructionInputKind accepts frozen kinds only", () => {
  assert.equal(isReconstructionInputKind("file-path"), true);
  assert.equal(isReconstructionInputKind("byte-reference"), true);
  assert.equal(isReconstructionInputKind("engine-native"), true);
  assert.equal(isReconstructionInputKind("usb-stick"), false);
});

test("isReconstructionContext accepts valid context and rejects malformed", () => {
  assert.equal(isReconstructionContext({ workspaceKey: "ws-1" }), true);
  assert.equal(
    isReconstructionContext({ workspaceKey: "ws-1", signal: new AbortController().signal }),
    true,
  );
  assert.equal(
    isReconstructionContext({
      workspaceKey: "ws-1",
      log: (level: string, message: string) => void `${level}:${message}`,
    }),
    true,
  );
  assert.equal(isReconstructionContext({ workspaceKey: "" }), false);
  assert.equal(isReconstructionContext({}), false);
  assert.equal(isReconstructionContext({ workspaceKey: "ws", signal: "later" }), false);
  assert.equal(isReconstructionContext({ workspaceKey: "ws", log: "console" }), false);
});

test("isReconstructionOperation accepts/rejects", () => {
  assert.equal(
    isReconstructionOperation({ operationId: "op-1", kind: "epoch.rename-entity" }),
    true,
  );
  assert.equal(
    isReconstructionOperation({ operationId: "op-1", kind: "k", payload: { entityId: "e" } }),
    true,
  );
  assert.equal(isReconstructionOperation({ operationId: "", kind: "k" }), false);
  assert.equal(isReconstructionOperation({ operationId: "op-1" }), false);
  assert.equal(isReconstructionOperation({ operationId: "op-1", kind: "k", payload: [] }), false);
  assert.equal(isReconstructionOperation(null), false);
});

test("isReconstructionEvent validates all three variants", () => {
  assert.equal(isReconstructionEvent({ type: "revision", revision: validRevision }), true);
  assert.equal(isReconstructionEvent({ type: "status", status: "open" }), true);
  assert.equal(
    isReconstructionEvent({ type: "status", status: "closing", detail: "by user" }),
    true,
  );
  assert.equal(isReconstructionEvent({ type: "error", message: "boom" }), true);
  assert.equal(isReconstructionEvent({ type: "revision", revision: {} }), false);
  assert.equal(isReconstructionEvent({ type: "status", status: "gone" }), false);
  assert.equal(isReconstructionEvent({ type: "error" }), false);
  assert.equal(isReconstructionEvent({ type: "surprise" }), false);
  assert.equal(isReconstructionEvent(null), false);
});
