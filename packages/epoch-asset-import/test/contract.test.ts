import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as pkg from "../src/index.js";
import {
  CONTRACT_LAWS,
  CONTRACT_NAME,
  CONTRACT_REVISION,
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "../src/contract.js";

test("runtime barrel exports exactly the contract runtime names", () => {
  assert.deepEqual(Object.keys(pkg).sort(), runtimeContractNames().sort());
});

test("assertPublicContract accepts the actual runtime surface", () => {
  assertPublicContract(Object.keys(pkg));
});

test("assertPublicContract throws on a missing runtime name", () => {
  assert.throws(
    () => assertPublicContract(runtimeContractNames().filter((name) => name !== "sha256Hex")),
    /mismatch/,
  );
});

test("assertPublicContract throws on an extra runtime name", () => {
  assert.throws(() => assertPublicContract([...runtimeContractNames(), "rogueExport"]), /mismatch/);
});

test("PUBLIC_CONTRACT names are unique and match publicContractNames", () => {
  const names = publicContractNames();
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, PUBLIC_CONTRACT.length);
});

test("PUBLIC_CONTRACT entries have valid kinds and non-empty summaries", () => {
  const kinds = new Set(["type", "function", "const"]);
  for (const entry of PUBLIC_CONTRACT) {
    assert.ok(kinds.has(entry.kind), `invalid kind: ${entry.kind}`);
    assert.ok(entry.name.length > 0, "empty entry name");
    assert.ok(entry.summary.length > 0, `empty summary: ${entry.name}`);
  }
});

test("CONTRACT_LAWS are kebab-id'd, unique and non-empty; revision is positive", () => {
  assert.ok(CONTRACT_LAWS.length > 0);
  const lawIds = CONTRACT_LAWS.map((law) => law.lawId);
  assert.equal(new Set(lawIds).size, lawIds.length);
  for (const law of CONTRACT_LAWS) {
    assert.match(law.lawId, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(law.statement.length > 0);
  }
  assert.equal(CONTRACT_NAME, "epoch-asset-import");
  assert.ok(CONTRACT_REVISION > 0);
});
