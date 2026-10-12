import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULE_ARTIFACTS, MODULE_MANIFEST_DIGEST, MODULE_NAME } from "../src/module.js";
import { digestJson } from "../src/canonical.js";

test("module: name matches the package", () => {
  assert.equal(MODULE_NAME, "@zcode/epoch-site-cesium");
});

test("module: every artifact has a path, role and summary", () => {
  for (const artifact of MODULE_ARTIFACTS) {
    assert.ok(artifact.path.startsWith("src/"));
    assert.ok(artifact.summary.length > 0);
    const roles = ["canonical", "contract", "validate", "types", "machine", "manifest", "barrel"];
    assert.ok(roles.includes(artifact.role));
  }
});

test("module: artifact paths are unique", () => {
  const paths = MODULE_ARTIFACTS.map((artifact) => artifact.path);
  assert.equal(new Set(paths).size, paths.length);
});

test("module: manifest covers every src file", () => {
  const declared = new Set(MODULE_ARTIFACTS.map((artifact) => artifact.path));
  const expected = [
    "src/canonical.ts",
    "src/contract.ts",
    "src/validate.ts",
    "src/types/site.ts",
    "src/types/placement.ts",
    "src/types/projection.ts",
    "src/types/validation.ts",
    "src/types/limitations.ts",
    "src/build/coordinate.ts",
    "src/build/site.ts",
    "src/build/placement.ts",
    "src/build/validate.ts",
    "src/build/projection.ts",
    "src/module.ts",
    "src/index.ts",
  ];
  for (const path of expected) {
    assert.ok(declared.has(path), `expected manifest to cover ${path}`);
  }
});

test("module: manifest digest is the digest over the manifest", () => {
  const expected = digestJson({
    moduleName: MODULE_NAME,
    artifacts: MODULE_ARTIFACTS,
  });
  assert.equal(MODULE_MANIFEST_DIGEST, expected);
  assert.match(MODULE_MANIFEST_DIGEST, /^[0-9a-f]{64}$/);
});
