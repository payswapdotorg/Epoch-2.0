import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULE_ARTIFACTS, MODULE_NAME, moduleManifestDigest, sha256Json } from "../src/index.js";

test("the module name matches the package name segment", () => {
  assert.equal(MODULE_NAME, "epoch-engineering-projections");
});

test("the manifest covers every source file with valid roles", () => {
  const paths = MODULE_ARTIFACTS.map((artifact) => artifact.path);
  assert.deepEqual(paths, [
    "src/build/boq.ts",
    "src/build/constraint.ts",
    "src/build/finding.ts",
    "src/build/inspector.ts",
    "src/build/limitations.ts",
    "src/build/links.ts",
    "src/build/quantity.ts",
    "src/canonical.ts",
    "src/contract.ts",
    "src/index.ts",
    "src/module.ts",
    "src/types/boq.ts",
    "src/types/constraint.ts",
    "src/types/finding.ts",
    "src/types/inspector.ts",
    "src/types/limitations.ts",
    "src/types/quantity.ts",
    "src/types/shared.ts",
    "src/validate.ts",
  ]);
  const validRoles = [
    "canonical",
    "contract",
    "validate",
    "types",
    "machine",
    "manifest",
    "barrel",
  ];
  for (const artifact of MODULE_ARTIFACTS) {
    assert.ok(validRoles.includes(artifact.role), `invalid role: ${artifact.role}`);
    assert.ok(artifact.summary.length > 0);
  }
});

test("the manifest digest is a stable digest over the manifest", () => {
  assert.match(moduleManifestDigest, /^[0-9a-f]{64}$/);
  const recomputed = sha256Json({
    moduleName: MODULE_NAME,
    artifacts: MODULE_ARTIFACTS.map((artifact) => ({
      path: artifact.path,
      role: artifact.role,
      summary: artifact.summary,
    })),
  });
  assert.equal(moduleManifestDigest, recomputed);
});

test("the manifest has exactly one artifact per non-domain role", () => {
  const count = (role: string): number =>
    MODULE_ARTIFACTS.filter((artifact) => artifact.role === role).length;
  assert.equal(count("canonical"), 1);
  assert.equal(count("contract"), 1);
  assert.equal(count("validate"), 1);
  assert.equal(count("manifest"), 1);
  assert.equal(count("barrel"), 1);
  assert.equal(count("machine"), 7);
  assert.equal(count("types"), 7);
});
