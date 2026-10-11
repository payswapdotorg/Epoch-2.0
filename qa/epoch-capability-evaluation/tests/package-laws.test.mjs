import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { MODULE_MANIFEST } from "./under-test.mjs";

const SRC_URL = new URL("../../../packages/epoch-capability-evaluation/src/", import.meta.url);

function sourceFiles() {
  return readdirSync(SRC_URL).filter((name) => name.endsWith(".ts"));
}

function readSource(name) {
  return readFileSync(new URL(name, SRC_URL), "utf8");
}

function lineCount(content) {
  const lines = content.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.length;
}

test("every source file is at most 400 lines and contract.ts at most 300", () => {
  for (const name of sourceFiles()) {
    const count = lineCount(readSource(name));
    if (name === "contract.ts") {
      assert.ok(count <= 300, `contract.ts has ${count} lines (law: <= 300)`);
    } else {
      assert.ok(count <= 400, `${name} has ${count} lines (law: <= 400)`);
    }
  }
});

test('hashing goes through node:crypto createHash("sha256") only', () => {
  const digestSource = readSource("digest.ts");
  assert.ok(digestSource.includes('from "node:crypto"'));
  for (const name of sourceFiles()) {
    const source = readSource(name);
    const algorithms = [...source.matchAll(/createHash\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
    for (const algorithm of algorithms) {
      assert.equal(algorithm, "sha256");
    }
  }
});

test("module manifest declares the contract home and the package laws", () => {
  assert.equal(MODULE_MANIFEST.moduleName, "@zcode/epoch-capability-evaluation");
  assert.equal(MODULE_MANIFEST.workOrder, "W030");
  assert.equal(MODULE_MANIFEST.contractHome, "./src/contract.ts");
  assert.equal(MODULE_MANIFEST.authority.execution, "none");
  for (const law of [
    "module-artifact",
    "hash-node-crypto-sha256",
    "canonical-serialization",
    "no-execution-authority",
  ]) {
    assert.ok(MODULE_MANIFEST.laws.includes(law), `missing law ${law}`);
  }
});

test("source imports stay within node builtins, relative files and the frozen discovery spine", () => {
  const allowed = (specifier) =>
    specifier.startsWith("./") || specifier === "node:crypto" || specifier === "@zcode/epoch-capability-discovery";
  for (const name of sourceFiles()) {
    const source = readSource(name);
    const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      assert.ok(allowed(specifier), `${name} imports disallowed specifier ${specifier}`);
    }
  }
});
