/**
 * epoch-solution-runtime 单元测试：runtime lifecycle、dispatch、portable state、
 * layer isolate、downstream projection link、measurement/annotation ref 管理。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSolutionRuntime,
  isolateLayer,
  unisolateLayers,
  projectEntityDownstream,
  readEntityQuantity,
  readEntityConstraintRefs,
} from "../src/index.ts";
import type { SolutionRuntimeHandle } from "../src/index.ts";
import type { WorldRevision, WorldEntity } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type { RendererSession, RendererHit } from "@zcode/epoch-renderer-contract";
import type { SolutionSurfaceTab } from "@zcode/epoch-solution-contract";

// Minimal fake renderer session recording calls so we can assert renderer-neutral
// dispatch semantics.
interface RecordedSession extends RendererSession {
  readonly navigateCalls: unknown[];
  readonly visibilityCalls: unknown[];
  readonly focusCalls: unknown[];
  disposed: boolean;
}

function createRecordedSession(): RecordedSession {
  const navigateCalls: unknown[] = [];
  const visibilityCalls: unknown[] = [];
  const focusCalls: unknown[] = [];
  return {
    navigateCalls,
    visibilityCalls,
    focusCalls,
    disposed: false,
    navigate: (input) => navigateCalls.push(input),
    async hitTest() {
      return null as RendererHit | null;
    },
    setVisibility: (input) => visibilityCalls.push(input),
    focus: (input) => focusCalls.push(input),
    async dispose() {
      this.disposed = true;
    },
  };
}

function buildMinimalEntity(overrides: Partial<WorldEntity> = {}): WorldEntity {
  return {
    entityId: "column-001",
    entityType: "column",
    label: "Column C1",
    phase: "structure",
    status: "proposed",
    material: { type: "concrete", grade: "C30" },
    dimensions: {
      length: { value: 4.2, unit: "m" },
      section: { value: 0.4, unit: "m" },
    },
    quantity: { value: 0.672, unit: "m^3" },
    constraints: ["constraint-slab-bearing-150kPa"],
    ...overrides,
  };
}

function buildMinimalRevision(
  entities: readonly WorldEntity[] = [buildMinimalEntity()],
): WorldRevision {
  return {
    worldId: "world-test",
    revisionId: "rev-001",
    digest: "0".repeat(64),
    entities,
    relationships: [],
    presentationSeed: { seed: "fixture-baseline" },
    provenance: [],
  };
}

function buildMinimalPresentation(): WorldPresentation {
  return {
    worldId: "world-test",
    revisionId: "rev-001",
    digest: "0".repeat(64),
    projectionMode: "3d",
    nodes: [
      {
        presentationId: "p:column-001",
        entityId: "column-001",
        transform: { translation: { x: 0, y: 0, z: 0 } },
        representations: [],
        visibility: "visible",
        interaction: { selectable: true, focusable: true, layerIds: ["STRUCTURE"] },
      },
    ],
  };
}

function buildMinimalTab(): SolutionSurfaceTab {
  return {
    id: "tab-001",
    type: "solution",
    workspaceKey: "workspace-test",
    engineId: "epoch-construction-fixture",
    sessionId: "session-001",
    solutionId: "construction-fixture:baseline",
    title: "Test",
    openedAt: 0,
  };
}

function attachHandle(
  runtime: ReturnType<typeof createSolutionRuntime>,
  session: RecordedSession,
  handleOverrides: Partial<SolutionRuntimeHandle> = {},
): void {
  const handle: SolutionRuntimeHandle = {
    tab: buildMinimalTab(),
    revision: buildMinimalRevision(),
    presentation: buildMinimalPresentation(),
    renderer: {
      descriptor: () => ({
        id: "fake-renderer",
        name: "Fake",
        version: "0.0.1",
        capabilities: {
          web: true,
          desktop: true,
          hitTesting: true,
          plan: true,
          section: false,
          walk: false,
        },
      }),
      mount: async () => session,
    },
    rendererSession: session,
    engineName: "test-engine",
    ...handleOverrides,
  };
  runtime.attachHandle(handle);
}

test("runtime starts in idle phase with no handle", () => {
  const runtime = createSolutionRuntime();
  assert.equal(runtime.state.phase, "idle");
  assert.equal(runtime.state.handle, null);
  assert.equal(runtime.selectedEntity, null);
  assert.equal(runtime.selectedLayer, null);
});

test("attachHandle moves to open phase and exposes handle", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  assert.equal(runtime.state.phase, "open");
  assert.equal(runtime.state.handle?.tab.id, "tab-001");
  assert.equal(runtime.state.handle?.engineName, "test-engine");
});

test("applyHit with entityId sets selection + invokes focus on session", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  runtime.applyHit({ presentationId: "p:column-001", entityId: "column-001" });
  assert.equal(runtime.state.selection.entityId, "column-001");
  assert.equal(runtime.state.selection.presentationId, "p:column-001");
  assert.equal(session.focusCalls.length, 1);
  assert.deepEqual(session.focusCalls[0], { entityId: "column-001" });
  assert.equal(runtime.selectedEntity?.entityId, "column-001");
  assert.equal(runtime.selectedLayer, "STRUCTURE");
});

test("applyHit with null clears selection and clears focus", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  runtime.applyHit({ presentationId: "p:column-001", entityId: "column-001" });
  runtime.applyHit(null);
  assert.equal(runtime.state.selection.entityId, null);
  assert.equal(session.focusCalls.length, 2);
  assert.deepEqual(session.focusCalls[1], {});
});

test("dispatch solution.navigate with entityIds frames those entities", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  const applied = runtime.dispatch({
    kind: "solution.navigate",
    entityIds: ["column-001"],
  });
  assert.equal(applied, true);
  assert.equal(session.navigateCalls.length, 1);
  assert.deepEqual(session.navigateCalls[0], { kind: "frame", entityIds: ["column-001"] });
});

test("dispatch solution.navigate with worldPoint uses look-at", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  runtime.dispatch({
    kind: "solution.navigate",
    worldPoint: { x: 1, y: 2, z: 3 },
  });
  assert.equal(session.navigateCalls.length, 1);
  assert.deepEqual(session.navigateCalls[0], {
    kind: "look-at",
    target: { x: 1, y: 2, z: 3 },
  });
});

test("dispatch solution.setLayerVisibility updates runtime state + session", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  runtime.dispatch({
    kind: "solution.setLayerVisibility",
    layerId: "STRUCTURE",
    visible: false,
  });
  assert.equal(runtime.state.layerVisibility["STRUCTURE"], false);
  assert.equal(session.visibilityCalls.length, 1);
  assert.deepEqual(session.visibilityCalls[0], { layerId: "STRUCTURE", visible: false });
});

test("dispatch without handle is a safe no-op returning false", () => {
  const runtime = createSolutionRuntime();
  const applied = runtime.dispatch({ kind: "solution.navigate" });
  assert.equal(applied, false);
});

test("snapshot returns portable state with current projection fields", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  runtime.applyHit({ presentationId: "p:column-001", entityId: "column-001" });
  runtime.dispatch({
    kind: "solution.setLayerVisibility",
    layerId: "STRUCTURE",
    visible: false,
  });
  runtime.addMeasurementRef("m:1");
  runtime.addAnnotationRef("a:1");
  const snapshot = runtime.snapshot();
  assert.ok(snapshot);
  assert.equal(snapshot!.worldId, "world-test");
  assert.equal(snapshot!.focusedEntityId, "column-001");
  assert.equal(snapshot!.selection.entityId, "column-001");
  assert.equal(snapshot!.layerVisibility["STRUCTURE"], false);
  assert.deepEqual([...snapshot!.measurementRefs], ["m:1"]);
  assert.deepEqual([...snapshot!.annotationRefs], ["a:1"]);
});

test("restore applies portable state back through session", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  const snapshot = {
    worldId: "world-test",
    digest: "0".repeat(64),
    focusedEntityId: "column-001",
    selection: { entityId: "column-001", presentationId: "p:column-001" },
    layerVisibility: { STRUCTURE: false, ENVELOPE: true },
    projectionMode: "3d" as const,
    measurementRefs: ["m:1"],
    annotationRefs: ["a:1"],
  };
  runtime.restore(snapshot);
  assert.equal(runtime.state.selection.entityId, "column-001");
  assert.equal(runtime.state.layerVisibility["STRUCTURE"], false);
  assert.equal(runtime.state.layerVisibility["ENVELOPE"], true);
  assert.deepEqual([...runtime.state.measurementRefs], ["m:1"]);
  assert.deepEqual([...runtime.state.annotationRefs], ["a:1"]);
  // focus called once with entityId
  assert.ok(
    session.focusCalls.some((call) => (call as { entityId?: string }).entityId === "column-001"),
  );
  // setVisibility called for STRUCTURE (false) + ENVELOPE (true)
  assert.ok(
    session.visibilityCalls.some(
      (call) =>
        (call as { layerId: string; visible: boolean }).layerId === "STRUCTURE" &&
        (call as { layerId: string; visible: boolean }).visible === false,
    ),
  );
});

test("restore rejects snapshot whose worldId does not match", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  const snapshot = {
    worldId: "different-world",
    digest: "x".repeat(64),
    focusedEntityId: "column-001",
    selection: { entityId: "column-001", presentationId: null },
    layerVisibility: {},
    projectionMode: "3d" as const,
    measurementRefs: [],
    annotationRefs: [],
  };
  runtime.restore(snapshot);
  // selection should remain null (rejected)
  assert.equal(runtime.state.selection.entityId, null);
});

test("isolateLayer solos target layer by hiding all others", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  const layerIds = ["SITE", "FOUNDATION", "STRUCTURE", "ENVELOPE", "MEP", "FINISHES"];
  isolateLayer(runtime, session, layerIds, "STRUCTURE");
  for (const id of layerIds) {
    const expected = id === "STRUCTURE";
    assert.equal(runtime.state.layerVisibility[id], expected, `layer ${id}`);
  }
  // 6 setVisibility calls (one per layer) + 6 dispatch notifications
  assert.equal(session.visibilityCalls.length, 6);
});

test("unisolateLayers restores all layers to visible", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  const layerIds = ["SITE", "FOUNDATION", "STRUCTURE", "ENVELOPE", "MEP", "FINISHES"];
  isolateLayer(runtime, session, layerIds, "STRUCTURE");
  session.visibilityCalls.length = 0;
  unisolateLayers(runtime, session, layerIds);
  for (const id of layerIds) {
    assert.equal(runtime.state.layerVisibility[id], true, `layer ${id}`);
  }
  assert.equal(session.visibilityCalls.length, 6);
});

test("projectEntityDownstream reads quantity + constraints from world model (no second BOQ)", () => {
  const entity = buildMinimalEntity();
  const presentation = buildMinimalPresentation();
  const projection = projectEntityDownstream(presentation, entity);
  assert.ok(projection);
  assert.equal(projection!.entityId, "column-001");
  assert.equal(projection!.layer, "STRUCTURE");
  assert.equal(projection!.phase, "structure");
  assert.equal(projection!.quantity?.value, 0.672);
  assert.equal(projection!.quantity?.unit, "m^3");
  assert.deepEqual([...projection!.constraintRefs], ["constraint-slab-bearing-150kPa"]);
  assert.ok(projection!.properties["length"]);
  assert.ok(projection!.properties["material"]);
});

test("projectEntityDownstream returns null when entity is null", () => {
  assert.equal(projectEntityDownstream(null, null), null);
});

test("readEntityQuantity returns null when entity lacks quantity", () => {
  assert.equal(readEntityQuantity(null), null);
  assert.equal(readEntityQuantity(buildMinimalEntity({ quantity: undefined })), null);
});

test("readEntityConstraintRefs returns empty array when entity lacks constraints", () => {
  assert.deepEqual([...readEntityConstraintRefs(null)], []);
  assert.deepEqual(
    [...readEntityConstraintRefs(buildMinimalEntity({ constraints: undefined }))],
    [],
  );
});

test("addMeasurementRef / removeMeasurementRef mutate runtime state", () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  runtime.addMeasurementRef("m:1");
  runtime.addMeasurementRef("m:2");
  assert.deepEqual([...runtime.state.measurementRefs], ["m:1", "m:2"]);
  // duplicate ignored
  runtime.addMeasurementRef("m:1");
  assert.deepEqual([...runtime.state.measurementRefs], ["m:1", "m:2"]);
  runtime.removeMeasurementRef("m:1");
  assert.deepEqual([...runtime.state.measurementRefs], ["m:2"]);
});

test("subscribe listener fires on state changes", () => {
  const runtime = createSolutionRuntime();
  const events: number[] = [];
  runtime.subscribe(() => events.push(events.length));
  attachHandle(runtime, createRecordedSession());
  runtime.dispatch({ kind: "solution.setLayerVisibility", layerId: "STRUCTURE", visible: false });
  assert.ok(events.length >= 2, "listener should fire on attachHandle + dispatch");
});

test("dispose clears handle and resets phase to idle", async () => {
  const runtime = createSolutionRuntime();
  const session = createRecordedSession();
  attachHandle(runtime, session);
  await runtime.dispose();
  assert.equal(runtime.state.phase, "idle");
  assert.equal(runtime.state.handle, null);
  assert.equal(session.disposed, true);
});
