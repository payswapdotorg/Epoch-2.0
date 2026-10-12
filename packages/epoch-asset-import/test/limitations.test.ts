import { test } from "node:test";
import * as assert from "node:assert/strict";
import { buildLimitationsReport, LIMITATIONS } from "../src/build/limitations.js";
import { sha256Canonical } from "../src/canonical.js";
import { MODULE_ARTIFACTS, MODULE_NAME, moduleManifestDigest } from "../src/module.js";
import type { LimitationScope } from "../src/types/limitations.js";

const SCOPES = new Set<LimitationScope>([
  "runtime",
  "format-matrix",
  "archives",
  "provenance",
  "contract",
]);

test("LIMITATIONS is an honest report", () => {
  assert.equal(LIMITATIONS.honest, true);
  assert.equal(LIMITATIONS.reportId, "epoch-asset-import-limitations");
  assert.ok(LIMITATIONS.items.length >= 5);
});

test("every limitation has a unique kebab id, valid scope and non-empty summary", () => {
  const ids = LIMITATIONS.items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of LIMITATIONS.items) {
    assert.match(item.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(SCOPES.has(item.scope));
    assert.ok(item.summary.length > 0);
  }
});

test("the report admits no Assimp binary ships here", () => {
  const item = LIMITATIONS.items.find((candidate) => candidate.id === "no-assimp-binary");
  assert.notEqual(item, undefined);
  assert.ok(item !== undefined && item.summary.includes("host"));
});

test("the report scopes compressed and encrypted archives out", () => {
  const item = LIMITATIONS.items.find((candidate) => candidate.id === "archives-out-of-scope");
  assert.notEqual(item, undefined);
});

test("buildLimitationsReport is deterministic and equals LIMITATIONS", () => {
  assert.deepEqual(buildLimitationsReport(), buildLimitationsReport());
  assert.deepEqual(buildLimitationsReport(), LIMITATIONS);
});

test("limitations cover runtime, format-matrix, archives and provenance scopes", () => {
  const scopes = new Set<LimitationScope>(LIMITATIONS.items.map((item) => item.scope));
  const expectedScopes: readonly LimitationScope[] = [
    "runtime",
    "format-matrix",
    "archives",
    "provenance",
  ];
  for (const expected of expectedScopes) {
    assert.ok(scopes.has(expected), `missing scope: ${expected}`);
  }
});

test("MODULE_ARTIFACTS covers every src artifact with valid roles", () => {
  assert.equal(MODULE_NAME, "epoch-asset-import");
  const paths = MODULE_ARTIFACTS.map((artifact) => artifact.path);
  assert.equal(new Set(paths).size, paths.length);
  const roles = new Set([
    "canonical",
    "contract",
    "validate",
    "types",
    "machine",
    "manifest",
    "barrel",
  ]);
  for (const artifact of MODULE_ARTIFACTS) {
    assert.ok(artifact.path.startsWith("src/"));
    assert.ok(roles.has(artifact.role));
    assert.ok(artifact.summary.length > 0);
  }
  for (const expected of [
    "src/canonical.ts",
    "src/contract.ts",
    "src/validate.ts",
    "src/index.ts",
    "src/module.ts",
    "src/types/manifest.ts",
    "src/build/manifest.ts",
  ]) {
    assert.ok(paths.includes(expected), `missing artifact: ${expected}`);
  }
});

test("moduleManifestDigest digests the canonical artifact manifest", () => {
  assert.match(moduleManifestDigest, /^[0-9a-f]{64}$/);
  assert.equal(moduleManifestDigest, sha256Canonical(MODULE_ARTIFACTS));
});
