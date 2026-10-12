import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, digestJson, sha256Hex } from "../src/canonical.js";

test("canonicalJson sorts keys recursively and strips whitespace", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test("canonicalJson is order-independent for objects", () => {
  assert.equal(canonicalJson({ x: 1, y: [1, 2] }), canonicalJson({ y: [1, 2], x: 1 }));
});

test("canonicalJson preserves array order", () => {
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
});

test("canonicalJson rejects non-finite numbers and functions", () => {
  assert.throws(() => canonicalJson(Number.NaN));
  assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY));
  assert.throws(() => canonicalJson({ f: () => 0 } as unknown));
});

test("sha256Hex produces lowercase hex digests", () => {
  const digest = sha256Hex("epoch");
  assert.match(digest, /^[0-9a-f]{64}$/);
});

test("sha256Hex matches known vector", () => {
  // SHA-256 of the empty string.
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("digestJson is stable across key order", () => {
  const a = digestJson({ siteId: "s", n: 1 });
  const b = digestJson({ n: 1, siteId: "s" });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});
