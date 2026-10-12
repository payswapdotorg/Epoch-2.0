import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as api from "../src/index.js";
import {
  CONTRACT_LAWS,
  CONTRACT_NAME,
  CONTRACT_REVISION,
  PUBLIC_CONTRACT,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "../src/contract.js";

test("index runtime exports exactly match runtimeContractNames", () => {
  const actual = Object.keys(api).sort();
  const expected = [...runtimeContractNames()].sort();
  assert.deepEqual(actual, expected);
});

test("assertPublicContract accepts the barrel and rejects drift", () => {
  assertPublicContract(Object.keys(api));
  assert.throws(() => assertPublicContract([...Object.keys(api), "rogueExport"]));
  assert.throws(() =>
    assertPublicContract(Object.keys(api).filter((name) => name !== "canonicalJson")),
  );
});

test("public contract entries are unique and well-kinded", () => {
  const names = publicContractNames();
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, PUBLIC_CONTRACT.length);
  const runtime = new Set(runtimeContractNames());
  for (const e of PUBLIC_CONTRACT) {
    assert.ok(e.name.length > 0);
    assert.ok(e.summary.length > 0);
    assert.ok(e.kind === "constant" || e.kind === "function" || e.kind === "type");
    if (e.kind === "type") {
      assert.ok(!runtime.has(e.name));
    }
  }
});

test("contract name and revision are well-formed", () => {
  assert.equal(CONTRACT_NAME, "epoch-foundation-blender");
  assert.ok(Number.isInteger(CONTRACT_REVISION) && CONTRACT_REVISION >= 1);
});

test("contract laws are unique and non-empty", () => {
  assert.ok(CONTRACT_LAWS.length >= 6);
  const ids = CONTRACT_LAWS.map((law) => law.lawId);
  assert.equal(new Set(ids).size, ids.length);
  for (const law of CONTRACT_LAWS) {
    assert.ok(law.statement.length > 0);
  }
});
