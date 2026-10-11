/**
 * W024 — Agent Tools: architecture boundary test — this package must never
 * import a renderer/presentation implementation. Static analysis over the
 * emitted and source trees.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(__dirname, "..");
const SRC_ROOT = join(PACKAGE_ROOT, "src");

const FORBIDDEN_SPECIFIERS = [
  "epoch-world-presentation",
  "epoch-webgl-renderer",
  "epoch-canvas-renderer",
  "epoch-renderer",
  "@zcode/epoch-world-presentation",
  "three",
  "@babylonjs",
  "pixi.js",
];

const FORBIDDEN_SPECIFIER_PATTERN =
  /(^|\/)(epoch-[a-z-]*renderer[a-z-]*|epoch-world-presentation)(\/|$)/;

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match !== null) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return specifiers;
}

describe("no-renderer-imports architecture boundary", () => {
  it("src never imports a renderer or presentation package", () => {
    const files = listFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        expect(
          FORBIDDEN_SPECIFIERS.includes(specifier) ||
            FORBIDDEN_SPECIFIER_PATTERN.test(specifier),
          `${file} must not import "${specifier}"`,
        ).toBe(false);
      }
    }
  });

  it("src has no runtime dependencies at all (ports are structural)", () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    );
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it("the only cross-package imports allowed are the frozen contract slices", () => {
    const files = listFiles(SRC_ROOT);
    const external: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith(".") && !specifier.startsWith("node:")) {
          external.push(specifier);
        }
      }
    }
    expect(external).toEqual([]);
  });
});
