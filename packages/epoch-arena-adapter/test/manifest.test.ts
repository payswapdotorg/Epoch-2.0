import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { arenaAdapterApi } from "../src/index.js";
import { MODULE_MANIFEST } from "../src/module.js";

function srcPath(relative: string): string {
  return fileURLToPath(new URL(`../../${relative}`, import.meta.url));
}

test("module manifest declares the module-artifact law artifacts", () => {
  assert.equal(MODULE_MANIFEST.name, "epoch-arena-adapter");
  assert.ok(MODULE_MANIFEST.artifacts.includes("src/module.ts"));
  assert.ok(MODULE_MANIFEST.artifacts.includes("src/contract.ts"));
  assert.ok(MODULE_MANIFEST.entrypoints.includes("src/index.ts"));
});

test("every declared source exists and no source is duplicated", () => {
  const sources = MODULE_MANIFEST.sources;
  assert.equal(new Set(sources).size, sources.length);
  for (const source of sources) {
    assert.ok(existsSync(srcPath(source)), `${source} must exist`);
  }
  for (const artifact of MODULE_MANIFEST.artifacts) {
    assert.ok(sources.includes(artifact), `${artifact} must be in sources`);
  }
  assert.ok(sources.includes("src/canonical.ts"));
});

test("file-size law: sources <= 400 lines, contract.ts <= 300 lines", () => {
  for (const source of MODULE_MANIFEST.sources) {
    const lines = readFileSync(srcPath(source), "utf8").split("\n").length;
    assert.ok(lines <= 400, `${source} has ${lines} lines (limit 400)`);
  }
  const contractLines = readFileSync(srcPath("src/contract.ts"), "utf8").split(
    "\n",
  ).length;
  assert.ok(
    contractLines <= 300,
    `contract.ts has ${contractLines} lines (limit 300)`,
  );
});

test("runtime dependencies: none (node: builtins only)", () => {
  assert.deepEqual(MODULE_MANIFEST.runtimeDependencies, []);
});

test("public API object exposes the contract functions", () => {
  const expected = [
    "buildArenaTaskPackage",
    "applyRedactions",
    "acceptanceFromQualification",
    "verifyTaskPackageDigest",
    "sealReturnPackage",
    "returnPackageDigest",
    "validateReturnPackage",
    "standardCriterionVerifier",
    "verifyReturn",
    "proposeWorldRevision",
    "decideReuseRights",
    "runSimulatedRoundTrip",
    "createSimulatedArenaEndpoint",
  ];
  const api = arenaAdapterApi as unknown as Record<string, unknown>;
  for (const key of expected) {
    assert.equal(typeof api[key], "function", `${key} must be a function`);
  }
});
