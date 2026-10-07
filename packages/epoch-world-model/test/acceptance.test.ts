/**
 * epoch-world-model 契约测试：W001 验收——零运行时依赖（仅 devDependencies）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;

test("package declares zero runtime dependencies", () => {
  assert.equal(manifest.dependencies, undefined);
});

test("package is private, ESM, source-exported", () => {
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.deepEqual(manifest.exports, { ".": "./src/index.ts" });
});

test("devDependencies contain no engine or UI libraries", () => {
  const devDependencies = Object.keys(
    (manifest.devDependencies ?? {}) as Record<string, string>,
  );
  const forbidden = /babylon|three|react|zod| Babylon |threejs/i;
  assert.equal(devDependencies.some((name) => forbidden.test(name)), false);
});
