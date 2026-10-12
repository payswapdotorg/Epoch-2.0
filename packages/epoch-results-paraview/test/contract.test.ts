import { test } from "node:test";
import assert from "node:assert/strict";
import * as barrel from "../src/index.js";
import {
  CONTRACT_LAWS,
  CONTRACT_NAME,
  CONTRACT_REVISION,
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "../src/contract.js";

function barrelExports(): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(barrel)) {
    exports[name] = value;
  }
  return exports;
}

test("assertPublicContract accepts the public barrel", () => {
  assertPublicContract(barrelExports());
});

test("the barrel exports exactly the contract runtime names", () => {
  assert.deepEqual(Object.keys(barrelExports()).sort(), [...runtimeContractNames()]);
});

test("assertPublicContract rejects a missing export", () => {
  const exports = barrelExports();
  delete exports.canonicalJson;
  assert.throws(() => assertPublicContract(exports), /missing \[canonicalJson\]/);
});

test("assertPublicContract rejects an unexpected export", () => {
  const exports = barrelExports();
  exports.surprise = 1;
  assert.throws(() => assertPublicContract(exports), /unexpected \[surprise\]/);
});

test("publicContractNames lists every entry exactly once", () => {
  const names = publicContractNames();
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("canonicalJson"));
  assert.ok(names.includes("validateResultDataset"));
  assert.ok(names.includes("summarizeProjectionCoverage"));
  assert.deepEqual(names, [...names].sort());
});

test("every public contract entry is well formed", () => {
  for (const entry of PUBLIC_CONTRACT) {
    assert.ok(entry.name.length > 0);
    assert.ok(entry.summary.length > 0);
    assert.ok(entry.kind === "type" || entry.kind === "function" || entry.kind === "const");
  }
});

test("contract laws are non-empty, unique and kebab-cased", () => {
  assert.ok(CONTRACT_LAWS.length >= 1);
  const ids = CONTRACT_LAWS.map((law) => law.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const law of CONTRACT_LAWS) {
    assert.match(law.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(law.statement.length > 0);
  }
});

test("contract identity is stable", () => {
  assert.equal(CONTRACT_NAME, "epoch-results-paraview");
  assert.equal(CONTRACT_REVISION, 1);
});
