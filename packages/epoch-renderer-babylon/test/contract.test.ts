/**
 * epoch-renderer-babylon 契约面测试：工厂守卫、描述符合法性、边界法
 * （Babylon 类型不越过公共入口）与包清单依赖法。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createBabylonRenderer,
  isBabylonHeadlessViewport,
  isBabylonRendererEngineMode,
  isBabylonRendererOptions,
  isInteractiveRenderer,
  isRendererDescriptor,
  isRendererSession,
  isWellFormedRenderer,
} from "../src/index.ts";

test("factory produces a well-formed InteractiveRenderer", () => {
  const renderer = createBabylonRenderer();
  assert.equal(isInteractiveRenderer(renderer), true);
  assert.equal(isWellFormedRenderer(renderer), true);
  assert.equal(typeof renderer.mount, "function");
  const withOptions = createBabylonRenderer({
    engineMode: "null",
    headlessViewport: { width: 320, height: 240 },
  });
  assert.equal(isWellFormedRenderer(withOptions), true);
});

test("factory rejects invalid options", () => {
  assert.throws(() => createBabylonRenderer({ engineMode: "webgpu" } as never), TypeError);
  assert.throws(
    () => createBabylonRenderer({ headlessViewport: { width: 10 } } as never),
    TypeError,
  );
  assert.throws(() => createBabylonRenderer("nope" as never), TypeError);
  assert.equal(isBabylonRendererOptions({ engineMode: "null" }), true);
  assert.equal(isBabylonRendererOptions({}), true);
  assert.equal(isBabylonRendererOptions(null), false);
  assert.equal(isBabylonRendererOptions({ engineMode: 3 }), false);
  assert.equal(isBabylonRendererOptions({ headlessViewport: { width: "a", height: 2 } }), false);
  assert.equal(isBabylonRendererEngineMode("auto"), true);
  assert.equal(isBabylonRendererEngineMode("webgl"), true);
  assert.equal(isBabylonRendererEngineMode("null"), true);
  assert.equal(isBabylonRendererEngineMode("webgpu"), false);
  assert.equal(isBabylonHeadlessViewport({ width: 800, height: 600 }), true);
  assert.equal(isBabylonHeadlessViewport({ width: 0, height: 600 }), true);
  assert.equal(isBabylonHeadlessViewport({ width: 800 }), false);
});

test("descriptor satisfies the frozen contract guard and stays honest", () => {
  const renderer = createBabylonRenderer();
  const descriptor = renderer.descriptor();
  assert.equal(isRendererDescriptor(descriptor), true);
  assert.equal(descriptor.id, "epoch-renderer-babylon");
  // 能力诚实性：W004 未实现 WebGPU/剖切/行走，不声明。
  assert.equal(descriptor.capabilities.webgpu, undefined);
  assert.equal(descriptor.capabilities.section, false);
  assert.equal(descriptor.capabilities.walk, false);
  assert.equal(descriptor.capabilities.hitTesting, true);
  assert.equal(descriptor.capabilities.webgl, true);
  // 每次返回新对象，避免跨会话共享可变状态。
  assert.notEqual(renderer.descriptor(), descriptor);
  assert.deepEqual(renderer.descriptor(), descriptor);
});

test("session objects satisfy the frozen structural guard", async () => {
  const renderer = createBabylonRenderer({ engineMode: "null" });
  const session = await renderer.mount(buildMinimalPresentation(), { container: undefined });
  assert.equal(isRendererSession(session), true);
  await session.dispose();
});

test("boundary law: the public entrypoint never imports Babylon", () => {
  const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
  const indexSource = readFileSync(`${srcDir}index.ts`, "utf8");
  const babylonImport = /(?:from\s+|import\s+|require\s*\(\s*)["']@babylonjs/;
  assert.equal(babylonImport.test(indexSource), false, "index.ts must not import @babylonjs");
});

test("boundary law: Babylon imports live only inside this adapter package", () => {
  const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
  const sources = readdirSync(srcDir).filter((name) => name.endsWith(".ts"));
  assert.ok(sources.length > 0);
  const babylonImport = /(?:from\s+|import\s+|require\s*\(\s*)["']@babylonjs/;
  const babylonImporters = sources.filter((name) =>
    babylonImport.test(readFileSync(`${srcDir}${name}`, "utf8")),
  );
  for (const name of babylonImporters) {
    assert.notEqual(name, "index.ts", "index.ts must stay Babylon-free");
    assert.notEqual(name, "contract.ts", "contract.ts must stay Babylon-free");
    assert.notEqual(name, "module.ts", "module.ts must stay Babylon-free");
  }
  assert.ok(babylonImporters.length > 0, "the adapter implementation must actually use Babylon");
});

test("boundary law: no Babylon class name is exported from the public entrypoint", async () => {
  const moduleNamespace = await import("../src/index.ts");
  const exportedNames = Object.keys(moduleNamespace as Record<string, unknown>).sort();
  const babylonClassNames = [
    "Scene",
    "Engine",
    "NullEngine",
    "Mesh",
    "MeshBuilder",
    "Vector3",
    "Color3",
    "Color4",
    "Matrix",
    "Quaternion",
    "TransformNode",
    "StandardMaterial",
    "VertexData",
    "ArcRotateCamera",
    "AbstractEngine",
  ];
  for (const name of babylonClassNames) {
    assert.equal(exportedNames.includes(name), false, `public entry exports Babylon class ${name}`);
  }
  // 公共面只含：工厂/选项守卫/描述符/模块清单 + 冻结契约再导出。
  for (const name of exportedNames) {
    const allowed =
      name.startsWith("is") ||
      name.startsWith("Babylon") ||
      name.startsWith("babylon") ||
      name.startsWith("BABYLON_") ||
      name.startsWith("create") ||
      [
        "isVec3",
        "isWorldPresentation",
        "isPortableRendererState",
        "isInteractiveRenderer",
        "isWellFormedRenderer",
        "isRendererSession",
        "isRendererHit",
        "isRendererMountOptions",
        "isRendererDescriptor",
        "isRendererCapabilities",
        "isFocusInput",
        "isHitTestInput",
        "isNavigationInput",
        "isVisibilityInput",
      ].includes(name) ||
      name === "default";
    assert.equal(allowed, true, `unexpected public export: ${name}`);
  }
});

test("package manifest law: epoch deps are workspace links, Babylon is a normal dependency", () => {
  const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  for (const [name, range] of Object.entries(manifest.dependencies)) {
    if (name === "@babylonjs/core") continue;
    assert.match(name, /^@zcode\/epoch-[a-z-]+$/);
    assert.equal(range, "workspace:*");
  }
  assert.equal(manifest.dependencies["@babylonjs/core"], "^9.30.0");
  // Babylon 不出现在 devDependencies（生产依赖，非测试工具）。
  for (const name of Object.keys(manifest.devDependencies)) {
    assert.equal(/babylon/i.test(name), false);
  }
});

function buildMinimalPresentation() {
  return {
    worldId: "world-contract",
    revisionId: "rev-001",
    digest: "0123456789abcdef0123456789abcdef",
    projectionMode: "3d",
    nodes: [
      {
        presentationId: "node-solo",
        entityId: "solo-001",
        transform: { translation: { x: 0, y: 0.5, z: 0 } },
        representations: [
          {
            representationId: "rep-solo",
            kind: "solid",
            format: "epoch.box@1",
            ref: JSON.stringify({ sizeX: 1, sizeY: 1, sizeZ: 1 }),
          },
        ],
        visibility: "visible",
        interaction: { selectable: true, focusable: true, layerIds: ["structure"] },
      },
    ],
  };
}
