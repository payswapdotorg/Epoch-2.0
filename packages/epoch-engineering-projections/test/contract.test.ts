import { test } from "node:test";
import assert from "node:assert/strict";
import * as index from "../src/index.js";
import {
  CONTRACT_LAWS,
  CONTRACT_NAME,
  CONTRACT_REVISION,
  assertPublicContract,
  publicContractNames,
  runtimeContractNames,
} from "../src/index.js";

test("the barrel exports exactly the runtime contract names", () => {
  assert.deepEqual(Object.keys(index).sort(), [...runtimeContractNames()]);
});

test("assertPublicContract accepts the barrel namespace", () => {
  assert.doesNotThrow(() => assertPublicContract(index));
});

test("assertPublicContract rejects a namespace with a missing export", () => {
  const broken: Record<string, unknown> = { ...index };
  delete broken["canonicalJson"];
  assert.throws(() => assertPublicContract(broken), /missing=\[canonicalJson\]/);
});

test("assertPublicContract rejects a namespace with an unexpected export", () => {
  const extra: Record<string, unknown> = { ...index, surprise: 1 };
  assert.throws(() => assertPublicContract(extra), /unexpected=\[surprise\]/);
});

test("contract metadata and laws are well-formed", () => {
  assert.equal(CONTRACT_NAME, "epoch-engineering-projections");
  assert.equal(CONTRACT_REVISION, 1);
  assert.ok(CONTRACT_LAWS.length >= 7);
  const lawIds = CONTRACT_LAWS.map((contractLaw) => contractLaw.lawId);
  assert.deepEqual(lawIds, [...new Set(lawIds)]);
  for (const contractLaw of CONTRACT_LAWS) {
    assert.match(contractLaw.lawId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(contractLaw.statement.length > 0);
  }
  const names = publicContractNames();
  assert.deepEqual(names, [...names].sort());
  for (const runtimeName of runtimeContractNames()) {
    assert.ok(names.includes(runtimeName));
  }
  assert.ok(names.includes("InspectorView"));
  assert.ok(names.includes("deriveInspectorView"));
});
