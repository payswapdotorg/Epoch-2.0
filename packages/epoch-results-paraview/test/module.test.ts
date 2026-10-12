import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULE_ARTIFACTS, MODULE_NAME, moduleManifestDigest } from "../src/module.js";
import { isDigestHex } from "../src/validate.js";

const EXPECTED_PATHS = [
  "src/canonical.ts",
  "src/contract.ts",
  "src/validate.ts",
  "src/types/branded.ts",
  "src/types/dataset.ts",
  "src/types/paraview.ts",
  "src/types/projection.ts",
  "src/types/limitations.ts",
  "src/build/dataset.ts",
  "src/build/plugin-ref.ts",
  "src/build/state-descriptor.ts",
  "src/build/projection.ts",
  "src/build/limitations.ts",
  "src/module.ts",
  "src/index.ts",
];

const ALLOWED_ROLES = [
  "canonical",
  "contract",
  "validate",
  "types",
  "machine",
  "manifest",
  "barrel",
];

test("the module name matches the package", () => {
  assert.equal(MODULE_NAME, "epoch-results-paraview");
});

test("the manifest lists every src artifact in order", () => {
  assert.deepEqual(
    MODULE_ARTIFACTS.map((artifact) => artifact.path),
    EXPECTED_PATHS,
  );
});

test("manifest roles come from the allowed set", () => {
  for (const artifact of MODULE_ARTIFACTS) {
    assert.ok(ALLOWED_ROLES.includes(artifact.role), `bad role: ${artifact.role}`);
    assert.ok(artifact.summary.length > 0);
  }
});

test("manifest paths are unique and live under src/", () => {
  const paths = MODULE_ARTIFACTS.map((artifact) => artifact.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    assert.ok(path.startsWith("src/"));
  }
});

test("the manifest digests deterministically to lowercase hex", () => {
  const first = moduleManifestDigest();
  const second = moduleManifestDigest();
  assert.equal(first, second);
  assert.ok(isDigestHex(first));
});
