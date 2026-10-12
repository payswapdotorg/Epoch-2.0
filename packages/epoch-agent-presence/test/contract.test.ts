import { test } from "node:test";
import { deepEqual, equal, match, ok, throws } from "node:assert/strict";
import * as barrel from "../src/index.js";
import {
  assertPublicContract,
  CONTRACT_LAWS,
  CONTRACT_NAME,
  CONTRACT_REVISION,
  LIMITATIONS_REPORT,
  PUBLIC_CONTRACT,
  publicContractNames,
  runtimeContractNames,
} from "../src/index.js";

test("CONTRACT_NAME and CONTRACT_REVISION are stable", () => {
  equal(CONTRACT_NAME, "epoch-agent-presence");
  equal(CONTRACT_REVISION, 1);
});

test("the barrel exports exactly the runtime contract names", () => {
  assertPublicContract(Object.keys(barrel));
});

test("public contract names are unique and sorted", () => {
  const names = publicContractNames();
  equal(new Set(names).size, names.length);
  deepEqual(names, [...names].sort());
});

test("runtime contract names are contained in the public contract", () => {
  const publicNames = new Set(publicContractNames());
  for (const name of runtimeContractNames()) {
    ok(publicNames.has(name));
  }
});

test("every public contract entry carries a name, kind, and summary", () => {
  ok(PUBLIC_CONTRACT.length >= 80);
  for (const contractEntry of PUBLIC_CONTRACT) {
    equal(typeof contractEntry.name, "string");
    ok(contractEntry.name.length > 0);
    ok(
      contractEntry.kind === "constant" ||
        contractEntry.kind === "function" ||
        contractEntry.kind === "type",
    );
    equal(typeof contractEntry.summary, "string");
    ok(contractEntry.summary.length > 0);
  }
});

test("CONTRACT_LAWS are typed records with kebab ids", () => {
  ok(CONTRACT_LAWS.length >= 8);
  for (const contractLaw of CONTRACT_LAWS) {
    match(contractLaw.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    ok(contractLaw.statement.length > 0);
  }
});

test("the derived-state law and the no-execution law are declared", () => {
  const ids = new Set(CONTRACT_LAWS.map((contractLaw) => contractLaw.id));
  ok(ids.has("derived-visual-state"));
  ok(ids.has("no-execution-authority"));
});

test("assertPublicContract throws on missing and unexpected runtime names", () => {
  throws(() => assertPublicContract(["canonicalJson"]), TypeError);
  throws(() => assertPublicContract([...runtimeContractNames(), "rogueExport"]), TypeError);
});

test("LIMITATIONS_REPORT records honest limitations", () => {
  ok(LIMITATIONS_REPORT.length >= 8);
  for (const limitation of LIMITATIONS_REPORT) {
    match(limitation.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    ok(limitation.statement.length > 0);
  }
});
