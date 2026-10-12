import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
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
import { moduleIdentityDigest } from "../src/module.js";

test("index exports match the public contract exactly", () => {
  const assertion = assertPublicContract(pkg);
  deepStrictEqual(assertion, { ok: true, runtimeExportCount: 54 });
});

test("contract names are unique and complete (136 entries)", () => {
  const names = publicContractNames();
  strictEqual(new Set(names).size, names.length);
  strictEqual(names.length, 136);
  strictEqual(PUBLIC_CONTRACT.length, 136);
});

test("contract constants", () => {
  strictEqual(CONTRACT_NAME, "@zcode/epoch-engineering-objective");
  strictEqual(CONTRACT_REVISION, 1);
});

test("laws cover hash, canonical form, authority and the quality law", () => {
  const joined = CONTRACT_LAWS.join("\n");
  ok(joined.includes("createHash"));
  ok(joined.includes("canonicalJson"));
  ok(joined.includes("no execution authority"));
  ok(joined.includes("unverified outputs never count as quality"));
  ok(joined.includes("never counted as automated successes"));
});

test("runtime contract names are a subset of all contract names", () => {
  const all = new Set(publicContractNames());
  for (const name of runtimeContractNames()) {
    ok(all.has(name));
  }
});

test("module identity digest is stable", () => {
  strictEqual(moduleIdentityDigest(), moduleIdentityDigest());
});
