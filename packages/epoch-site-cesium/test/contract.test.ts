import assert from "node:assert/strict";
import { test } from "node:test";
import * as barrel from "../src/index.js";
import {
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "../src/contract.js";

test("contract: barrel exports exactly the declared runtime names", () => {
  assertPublicContract(runtimeContractNames(barrel));
});

test("contract: declared names are unique and non-empty", () => {
  const names = PUBLIC_CONTRACT.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length);
  for (const entry of PUBLIC_CONTRACT) {
    assert.ok(entry.name.length > 0);
    assert.ok(entry.summary.length > 0);
    assert.ok(entry.kind === "const" || entry.kind === "function" || entry.kind === "machine");
  }
});

test("contract: publicContractNames is sorted", () => {
  const names = publicContractNames();
  const sorted = [...names].sort();
  assert.deepEqual(names, sorted);
});

test("contract: assertPublicContract rejects extra and missing names", () => {
  const names = publicContractNames();
  assert.throws(() => assertPublicContract([...names, "rogueExport"]));
  assert.throws(() => assertPublicContract(names.slice(1)));
});

test("contract: barrel exports every declared name as a defined value", () => {
  const record = barrel as unknown as Record<string, unknown>;
  for (const name of publicContractNames()) {
    assert.notEqual(record[name], undefined, `expected export ${name}`);
  }
});
