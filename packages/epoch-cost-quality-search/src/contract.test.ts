import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTRACT_EXPORTS,
  CONTRACT_LAWS,
  contractDigest,
  moduleManifest,
  moduleManifestDigest,
} from "./index.js";
import * as api from "./index.js";

describe("contract", () => {
  it("declares every runtime export of the package entrypoint", () => {
    const declared = new Set(CONTRACT_EXPORTS.map((entry) => entry.name));
    for (const name of Object.keys(api)) {
      assert.ok(declared.has(name), `${name} is undeclared in the contract`);
    }
    for (const declaration of CONTRACT_EXPORTS) {
      if (declaration.kind === "type") {
        continue;
      }
      assert.ok(
        declaration.name in api,
        `${declaration.name} is declared but missing from the entrypoint`,
      );
      if (declaration.kind === "function") {
        assert.equal(
          typeof api[declaration.name as keyof typeof api],
          "function",
        );
      }
    }
  });

  it("produces a deterministic contract digest", () => {
    const first = contractDigest();
    const second = contractDigest();
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.ok(CONTRACT_LAWS.length >= 10);
  });
});

describe("moduleManifest", () => {
  it("lists every source artifact, the contract home and valid law ids", () => {
    const paths = moduleManifest.artifacts.map((artifact) => artifact.path);
    assert.equal(new Set(paths).size, paths.length);
    assert.ok(paths.includes(moduleManifest.contractHome));
    assert.ok(paths.includes(moduleManifest.entrypoint));
    assert.ok(paths.includes("src/frontier.test.ts"));
    const lawIds = new Set(CONTRACT_LAWS.map((law) => law.lawId));
    for (const lawId of moduleManifest.lawIds) {
      assert.ok(lawIds.has(lawId), `unknown law id ${lawId}`);
    }
    assert.deepEqual(moduleManifest.runtimeDependencies, []);
    assert.equal(moduleManifestDigest(), moduleManifestDigest());
  });
});
