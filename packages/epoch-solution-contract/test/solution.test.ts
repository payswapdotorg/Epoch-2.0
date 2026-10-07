/**
 * epoch-solution-contract 契约测试：tab/操作/意图/引擎元数据守卫。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeWorldDigest } from "../../epoch-world-model/src/index.ts";
import {
  isSolutionEngineMetadata,
  isSolutionInteractionIntent,
  isSolutionOpenRequest,
  isSolutionOpenResult,
  isSolutionSurfaceOperation,
  isSolutionSurfaceState,
  isSolutionSurfaceTab,
} from "../src/index.ts";

const validTab = {
  id: "tab-001",
  type: "solution",
  workspaceKey: "ws-1",
  ownerTaskId: null,
  engineId: "epoch-fixture",
  sessionId: "session-001",
  solutionId: "solution-001",
  title: "Site Model A",
  openedAt: 1730000000000,
};

const validEngine = {
  id: "epoch-fixture",
  name: "Epoch Fixture Engine",
  version: "1.0.0",
  runtime: "in-process",
  inputKinds: ["file-path"],
  capabilities: {
    open: true,
    inspect: true,
    mutate: false,
    timeline: false,
    variants: false,
    measurements: false,
    simulation: false,
  },
};

const validRevision = {
  worldId: "world-001",
  revisionId: "rev-001",
  digest: computeWorldDigest({
    worldId: "world-001",
    entities: [{ entityId: "column-001", entityType: "column", label: "C1" }],
    relationships: [],
  }),
  entities: [{ entityId: "column-001", entityType: "column", label: "C1" }],
  relationships: [],
  presentationSeed: { seed: "seed-001" },
  provenance: [],
};

const validOpenRequest = {
  workspaceKey: "ws-1",
  engineId: "epoch-fixture",
  input: { kind: "file-path", path: "/models/site.fixture.json" },
  solutionId: "solution-001",
  title: "Site Model A",
};

test("isSolutionSurfaceTab accepts a valid tab", () => {
  assert.equal(isSolutionSurfaceTab(validTab), true);
});

test("isSolutionSurfaceTab rejects wrong type discriminator", () => {
  assert.equal(isSolutionSurfaceTab({ ...validTab, type: "browser" }), false);
  assert.equal(isSolutionSurfaceTab({ ...validTab, type: "terminal" }), false);
});

test("isSolutionSurfaceTab rejects missing/wrong mandatory fields", () => {
  const { engineId, ...withoutEngineId } = validTab;
  assert.equal(isSolutionSurfaceTab(withoutEngineId), false);
  assert.equal(isSolutionSurfaceTab({ ...validTab, sessionId: "" }), false);
  assert.equal(isSolutionSurfaceTab({ ...validTab, openedAt: "yesterday" }), false);
  assert.equal(isSolutionSurfaceTab({ ...validTab, openedAt: -1 }), false);
  assert.equal(isSolutionSurfaceTab({ ...validTab, title: null }), false);
  assert.equal(isSolutionSurfaceTab(null), false);
});

test("isSolutionSurfaceTab allows ownerTaskId variants", () => {
  assert.equal(isSolutionSurfaceTab({ ...validTab, ownerTaskId: "task-9" }), true);
  assert.equal(isSolutionSurfaceTab({ ...validTab, ownerTaskId: undefined }), true);
  assert.equal(isSolutionSurfaceTab({ ...validTab, ownerTaskId: 9 }), false);
});

test("isSolutionSurfaceState validates list results", () => {
  assert.equal(isSolutionSurfaceState({ tabs: [validTab], activeTabId: "tab-001" }), true);
  assert.equal(isSolutionSurfaceState({ tabs: [], activeTabId: null }), true);
  assert.equal(isSolutionSurfaceState({ tabs: [{}] }), false);
  assert.equal(isSolutionSurfaceState({ tabs: [], activeTabId: 1 }), false);
});

test("isSolutionOpenRequest accepts valid requests", () => {
  assert.equal(isSolutionOpenRequest(validOpenRequest), true);
  assert.equal(
    isSolutionOpenRequest({
      workspaceKey: "ws-1",
      engineId: "epoch-fixture",
      input: { kind: "engine-native", engineId: "blender", payload: { scene: 1 } },
    }),
    true,
  );
});

test("isSolutionOpenRequest rejects malformed inputs", () => {
  assert.equal(isSolutionOpenRequest({ ...validOpenRequest, engineId: "" }), false);
  assert.equal(isSolutionOpenRequest({ ...validOpenRequest, input: { kind: "?" } }), false);
  assert.equal(isSolutionOpenRequest({ ...validOpenRequest, input: { kind: "file-path" } }), false);
  assert.equal(isSolutionOpenRequest(null), false);
});

test("isSolutionOpenResult validates the idempotent open payload", () => {
  assert.equal(
    isSolutionOpenResult({
      tab: validTab,
      revision: validRevision,
      engine: validEngine,
      created: true,
    }),
    true,
  );
  assert.equal(
    isSolutionOpenResult({
      tab: validTab,
      revision: validRevision,
      engine: validEngine,
      created: "yes",
    }),
    false,
  );
  assert.equal(
    isSolutionOpenResult({ tab: validTab, revision: {}, engine: validEngine, created: false }),
    false,
  );
});

test("isSolutionSurfaceOperation validates the five frozen operations", () => {
  assert.equal(
    isSolutionSurfaceOperation({ kind: "solution.open", request: validOpenRequest }),
    true,
  );
  assert.equal(
    isSolutionSurfaceOperation({ kind: "solution.activate", request: { tabId: "t" } }),
    true,
  );
  assert.equal(
    isSolutionSurfaceOperation({ kind: "solution.close", request: { tabId: "t" } }),
    true,
  );
  assert.equal(
    isSolutionSurfaceOperation({ kind: "solution.reopen", request: { tabId: "t" } }),
    true,
  );
  assert.equal(isSolutionSurfaceOperation({ kind: "solution.list" }), true);
});

test("isSolutionSurfaceOperation rejects unknown kinds and bad payloads", () => {
  assert.equal(isSolutionSurfaceOperation({ kind: "solution.refresh" }), false);
  assert.equal(isSolutionSurfaceOperation({ kind: "solution.activate", request: {} }), false);
  assert.equal(
    isSolutionSurfaceOperation({ kind: "solution.open", request: { workspaceKey: "" } }),
    false,
  );
  assert.equal(isSolutionSurfaceOperation(null), false);
});

test("isSolutionEngineMetadata mirrors the engine descriptor guard", () => {
  assert.equal(isSolutionEngineMetadata(validEngine), true);
  assert.equal(isSolutionEngineMetadata({ ...validEngine, runtime: "cloud" }), false);
  assert.equal(isSolutionEngineMetadata(null), false);
});

test("isSolutionInteractionIntent accepts all six frozen intents", () => {
  const intents = [
    { kind: "solution.navigate", entityIds: ["column-001"] },
    { kind: "solution.navigate", worldPoint: { x: 1, y: 2, z: 3 } },
    { kind: "solution.select", entityIds: ["column-001"], mode: "add" },
    { kind: "solution.focus", entityId: "column-001" },
    { kind: "solution.focus" },
    { kind: "solution.setLayerVisibility", layerId: "structural", visible: false },
    {
      kind: "solution.measure",
      from: { entityId: "column-001" },
      to: { point: { x: 0, y: 3, z: 0 } },
    },
    {
      kind: "solution.annotate",
      text: "复核梁底标高",
      entityId: "beam-001",
    },
  ];
  for (const intent of intents) {
    assert.equal(isSolutionInteractionIntent(intent), true, `kind=${String(intent.kind)}`);
  }
});

test("isSolutionInteractionIntent rejects unknown kinds (closed union)", () => {
  assert.equal(isSolutionInteractionIntent({ kind: "solution.manipulate" }), false);
  assert.equal(isSolutionInteractionIntent({ kind: "solution.simulate" }), false);
  assert.equal(isSolutionInteractionIntent({ kind: "select" }), false);
  assert.equal(isSolutionInteractionIntent(null), false);
});

test("isSolutionInteractionIntent rejects malformed payloads", () => {
  assert.equal(isSolutionInteractionIntent({ kind: "solution.select", entityIds: [] }), false);
  assert.equal(
    isSolutionInteractionIntent({ kind: "solution.select", entityIds: ["a"], mode: "xor" }),
    false,
  );
  assert.equal(
    isSolutionInteractionIntent({ kind: "solution.setLayerVisibility", layerId: "" }),
    false,
  );
  assert.equal(isSolutionInteractionIntent({ kind: "solution.annotate", text: "" }), false);
  assert.equal(isSolutionInteractionIntent({ kind: "solution.measure", from: {}, to: {} }), false);
  assert.equal(
    isSolutionInteractionIntent({ kind: "solution.navigate", worldPoint: { x: 1, y: 2 } }),
    false,
  );
});

test("intents stay renderer-neutral (no functions/engine handles in payloads)", () => {
  const intents = [
    { kind: "solution.navigate", entityIds: ["e"], worldPoint: { x: 1, y: 2, z: 3 } },
    { kind: "solution.select", entityIds: ["e"], mode: "replace" as const },
    { kind: "solution.focus", entityId: "e" },
    { kind: "solution.setLayerVisibility", layerId: "l", visible: true },
    { kind: "solution.measure", from: { entityId: "e" }, to: { point: { x: 0, y: 0, z: 0 } } },
    { kind: "solution.annotate", text: "t", point: { x: 0, y: 0, z: 0 } },
  ];
  for (const intent of intents) {
    assert.equal(isSolutionInteractionIntent(intent), true);
    const encoded = JSON.stringify(intent);
    assert.match(encoded, /^[\{\}\[\]":,a-zA-Z0-9\-\.\s]+$/);
  }
});

test("package runtime dependencies are workspace-only epoch links", () => {
  const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const dependencies = (manifest.dependencies ?? {}) as Record<string, string>;
  for (const [name, range] of Object.entries(dependencies)) {
    assert.match(name, /^@zcode\/epoch-[a-z-]+$/);
    assert.equal(range, "workspace:*");
  }
  const devDependencies = Object.keys((manifest.devDependencies ?? {}) as Record<string, string>);
  const forbidden = /babylon|three|react|zod/i;
  assert.equal(
    devDependencies.some((name) => forbidden.test(name)),
    false,
  );
});

test("solution contract sources never import engine or UI implementations", () => {
  const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
  const sources = readdirSync(srcDir).filter((name) => name.endsWith(".ts"));
  assert.ok(sources.length > 0);
  for (const name of sources) {
    const source = readFileSync(`${srcDir}${name}`, "utf8");
    assert.equal(
      /@babylonjs|from\s+["']three["']|from\s+["']react["']|from\s+["']zod["']/.test(source),
      false,
      `${name} must not import engine/UI libraries`,
    );
  }
});
