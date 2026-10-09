/**
 * epoch-world-interaction 单元测试：measurement registry、annotation registry、
 * plan-view path、section-cut path、capability boundary 诚实性。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorldInteraction,
  createMeasurementRegistry,
  createAnnotationRegistry,
  computePlanViewPath,
  computeSectionCutPath,
  planViewPathToNavigationInputs,
  sectionCutPathToVisibilityInputs,
  DEFAULT_SECTION_HIDDEN_LAYERS,
} from "../src/index.ts";

test("measurement registry: createLinear returns SI meters + formatted displayValue", () => {
  const registry = createMeasurementRegistry({
    now: () => 1_000,
  });
  const m = registry.createLinear({ point: { x: 0, y: 0, z: 0 } }, { point: { x: 3, y: 4, z: 0 } });
  assert.equal(m.measurementId, "m:1");
  assert.equal(m.kind, "linear");
  assert.equal(m.value, 5);
  assert.equal(m.displayValue, "5.00 m");
  assert.equal(m.createdAt, 1_000);
});

test("measurement registry: resolves entityId via injected entityPoints map", () => {
  const entityPoints = new Map([
    ["column-001", { x: 1, y: 0, z: 1 }],
    ["column-002", { x: 4, y: 0, z: 5 }],
  ]);
  const registry = createMeasurementRegistry({ entityPoints });
  const m = registry.createLinear({ entityId: "column-001" }, { entityId: "column-002" });
  assert.equal(m.value, 5); // (4-1)^2 + 0 + (5-1)^2 = 9+16 = 25 -> sqrt 5
});

test("measurement registry: getById / list / remove / clear", () => {
  const registry = createMeasurementRegistry();
  const m1 = registry.createLinear(
    { point: { x: 0, y: 0, z: 0 } },
    { point: { x: 1, y: 0, z: 0 } },
  );
  const m2 = registry.createLinear(
    { point: { x: 0, y: 0, z: 0 } },
    { point: { x: 2, y: 0, z: 0 } },
  );
  assert.equal(registry.list().length, 2);
  assert.ok(registry.getById(m1.measurementId));
  assert.ok(registry.getById(m2.measurementId));
  assert.equal(registry.remove(m1.measurementId), true);
  assert.equal(registry.list().length, 1);
  registry.clear();
  assert.equal(registry.list().length, 0);
});

test("measurement registry: createLinear throws on invalid measurement point", () => {
  const registry = createMeasurementRegistry();
  assert.throws(
    () => registry.createLinear({} as never, { point: { x: 0, y: 0, z: 0 } }),
    TypeError,
  );
});

test("annotation registry: createNote anchored to entityId", () => {
  const registry = createAnnotationRegistry({ now: () => 500 });
  const ann = registry.createNote("Foundation clear of clashes", {
    entityId: "foundation-strip-footing-south",
  });
  assert.ok(ann);
  assert.equal(ann!.annotationId, "a:1");
  assert.equal(ann!.text, "Foundation clear of clashes");
  assert.equal(ann!.entityId, "foundation-strip-footing-south");
  assert.equal(ann!.createdAt, 500);
});

test("annotation registry: createNote anchored to world point (survives navigation)", () => {
  const registry = createAnnotationRegistry();
  const ann = registry.createNote("Beam midspan", { point: { x: 2.5, y: 3.0, z: 0 } });
  assert.ok(ann);
  assert.deepEqual(ann!.point, { x: 2.5, y: 3.0, z: 0 });
  assert.equal(ann!.entityId, undefined);
});

test("annotation registry: rejects empty text and unanchored notes", () => {
  const registry = createAnnotationRegistry();
  assert.equal(registry.createNote("", { entityId: "x" }), null);
  assert.equal(registry.createNote("no anchor", {}), null);
});

test("annotation registry: getById / list / remove / clear", () => {
  const registry = createAnnotationRegistry();
  const a1 = registry.createNote("A", { entityId: "e1" });
  const a2 = registry.createNote("B", { point: { x: 0, y: 0, z: 0 } });
  assert.equal(registry.list().length, 2);
  assert.ok(registry.getById(a1!.annotationId));
  assert.ok(registry.getById(a2!.annotationId));
  registry.remove(a1!.annotationId);
  assert.equal(registry.list().length, 1);
  registry.clear();
  assert.equal(registry.list().length, 0);
});

test("plan-view path: high elevation + zoom factor for orthographic-style view", () => {
  const path = computePlanViewPath({ center: { x: 5, y: 0, z: 5 }, radius: 12 });
  assert.equal(path.kind, "plan-view");
  assert.deepEqual(path.target, { x: 5, y: 0, z: 5 });
  assert.deepEqual(path.position, { x: 5, y: 48, z: 5 }); // 12*4=48 >= 30
  assert.ok(path.zoomFactor > 1, "plan view should zoom out");
});

test("plan-view path: clamps height to at least 30", () => {
  const path = computePlanViewPath({ center: { x: 0, y: 0, z: 0 }, radius: 1 });
  assert.equal(path.position.y, 30); // max(1*4, 30)
});

test("planViewPathToNavigationInputs returns look-at + zoom sequence", () => {
  const path = computePlanViewPath({ center: { x: 0, y: 0, z: 0 }, radius: 10 });
  const inputs = planViewPathToNavigationInputs(path);
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].kind, "look-at");
  assert.equal(inputs[1].kind, "zoom");
  assert.deepEqual(inputs[0].target, { x: 0, y: 0, z: 0 });
  assert.deepEqual(inputs[0].position, { x: 0, y: 40, z: 0 });
  assert.equal(inputs[1].factor, path.zoomFactor);
});

test("section-cut path: hides ENVELOPE/MEP/FINISHES by default (capability boundary honest)", () => {
  const path = computeSectionCutPath({ center: { x: 0, y: 0, z: 0 }, radius: 10 });
  assert.equal(path.kind, "section-cut");
  assert.deepEqual([...path.hiddenLayerIds], [...DEFAULT_SECTION_HIDDEN_LAYERS]);
  assert.deepEqual([...DEFAULT_SECTION_HIDDEN_LAYERS], ["FINISHES", "MEP", "ENVELOPE"]);
});

test("section-cut path: respects explicit hiddenLayerIds override", () => {
  const path = computeSectionCutPath(
    { center: { x: 0, y: 0, z: 0 }, radius: 10 },
    { hiddenLayerIds: ["STRUCTURE"] },
  );
  assert.deepEqual([...path.hiddenLayerIds], ["STRUCTURE"]);
});

test("sectionCutPathToVisibilityInputs returns visibility=false for each hidden layer", () => {
  const path = computeSectionCutPath({ center: { x: 0, y: 0, z: 0 }, radius: 10 });
  const inputs = sectionCutPathToVisibilityInputs(path);
  assert.equal(inputs.length, 3);
  for (const input of inputs) {
    assert.equal(input.visible, false);
  }
  assert.ok(inputs.some((i) => i.layerId === "ENVELOPE"));
  assert.ok(inputs.some((i) => i.layerId === "MEP"));
  assert.ok(inputs.some((i) => i.layerId === "FINISHES"));
});

test("world interaction layer factory: composes measurements + annotations + path calculators", () => {
  const layer = createWorldInteraction({
    entityPoints: new Map([["e1", { x: 0, y: 0, z: 0 }]]),
  });
  const m = layer.measurements.createLinear({ entityId: "e1" }, { point: { x: 3, y: 4, z: 0 } });
  assert.equal(m.value, 5);
  const a = layer.annotations.createNote("hello", { entityId: "e1" });
  assert.ok(a);
  const p = layer.computePlanViewPath({ center: { x: 0, y: 0, z: 0 }, radius: 5 });
  assert.equal(p.kind, "plan-view");
  const s = layer.computeSectionCutPath({ center: { x: 0, y: 0, z: 0 }, radius: 5 });
  assert.equal(s.kind, "section-cut");
});

test("boundary law: public entrypoint never imports engine libraries", async () => {
  const mod = await import("../src/index.ts");
  const names = Object.keys(mod as Record<string, unknown>);
  // No Babylon/Three classes exported.
  const forbidden = ["Scene", "Engine", "Vector3", "Mesh", "Color3"];
  for (const name of forbidden) {
    assert.equal(names.includes(name), false, `public entry must not export engine class ${name}`);
  }
});

test("boundary law: index.ts does not import @babylonjs or three", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
  const indexSource = readFileSync(`${srcDir}index.ts`, "utf8");
  const engineImport = /(?:from\s+|import\s+|require\s*\(\s*)["']@babylonjs|["']three/;
  assert.equal(engineImport.test(indexSource), false, "index.ts must not import @babylonjs/three");
});

test("package manifest law: epoch deps are workspace links", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    dependencies: Record<string, string>;
  };
  for (const [name, range] of Object.entries(manifest.dependencies)) {
    if (name.startsWith("@zcode/epoch-")) {
      assert.equal(range, "workspace:*", `${name} should be workspace:*`);
    }
  }
  // No engine libraries in dependencies.
  for (const name of Object.keys(manifest.dependencies)) {
    assert.equal(/babylon|three/i.test(name), false, `engine lib ${name} must not be a dep`);
  }
});
