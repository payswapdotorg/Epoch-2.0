import { test } from "node:test";
import assert from "node:assert/strict";
import * as contract from "../src/contract.js";
import * as entrypoint from "../src/index.js";
import { CONTRACT_SURFACE } from "../src/contract.js";
import { MODULE_ARTIFACT, moduleSummary } from "../src/index.js";

test("CONTRACT_SURFACE matches the live contract exports exactly", () => {
  const exported = Object.keys(contract).sort();
  const surface = [...CONTRACT_SURFACE].sort();
  assert.deepEqual(exported, surface);
});

test("the public entrypoint re-exports the contract plus the module manifest", () => {
  const exported = new Set(Object.keys(entrypoint));
  for (const name of CONTRACT_SURFACE) {
    assert.equal(exported.has(name), true, `entrypoint is missing ${name}`);
  }
  assert.equal(exported.has("MODULE_ARTIFACT"), true);
  assert.equal(exported.has("moduleSummary"), true);
});

test("MODULE_ARTIFACT declares the W026 module laws and authority", () => {
  assert.equal(MODULE_ARTIFACT.kind, "module-artifact");
  assert.equal(MODULE_ARTIFACT.module, "@zcode/epoch-productization");
  assert.equal(MODULE_ARTIFACT.workOrder, "W026");
  assert.equal(MODULE_ARTIFACT.role, "infrastructure-adapter");
  assert.equal(MODULE_ARTIFACT.semanticAuthority, "none");
  assert.equal(MODULE_ARTIFACT.executionAuthority, "plans-and-verifies-only");
  assert.deepEqual(MODULE_ARTIFACT.runtimeDependencies, []);
  assert.equal(MODULE_ARTIFACT.consumes[0]?.writes, "never");
  assert.equal(
    MODULE_ARTIFACT.laws.includes(
      "commands are data: plan and verify only, never execute or deploy",
    ),
    true,
  );
  assert.equal(MODULE_ARTIFACT.publicEntrypoint, "src/index.ts");
  assert.equal(MODULE_ARTIFACT.contractHome, "src/contract.ts");
});

test("moduleSummary is a deterministic one-liner", () => {
  assert.equal(moduleSummary(), moduleSummary());
  assert.equal(moduleSummary().includes("@zcode/epoch-productization"), true);
});

test("the test battery is enumerated and sorted in the manifest", () => {
  assert.equal(MODULE_ARTIFACT.testBattery.length, 7);
  assert.deepEqual([...MODULE_ARTIFACT.testBattery].sort(), MODULE_ARTIFACT.testBattery);
});
