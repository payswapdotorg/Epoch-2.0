import { test } from "node:test";
import * as assert from "node:assert/strict";
import { canonicalJson, sha256Canonical, sha256Hex } from "../src/canonical.js";

test("canonicalJson sorts object keys recursively", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test("canonicalJson emits no whitespace", () => {
  assert.equal(canonicalJson({ x: [1, 2, { y: "z" }] }), '{"x":[1,2,{"y":"z"}]}');
});

test("canonicalJson preserves array order (arrays are data, not maps)", () => {
  assert.equal(canonicalJson(["b", "a"]), '["b","a"]');
});

test("canonicalJson serializes primitives", () => {
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson(false), "false");
  assert.equal(canonicalJson("s"), '"s"');
  assert.equal(canonicalJson(7), "7");
  assert.equal(canonicalJson({}), "{}");
});

test("canonicalJson rejects non-finite numbers", () => {
  assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY), /non-finite/);
  assert.throws(() => canonicalJson(Number.NaN), /non-finite/);
});

test("canonicalJson rejects non-canonicalizable values", () => {
  assert.throws(() => canonicalJson(undefined), /not canonicalizable/);
  assert.throws(() => canonicalJson(() => 1), /not canonicalizable/);
  assert.throws(() => canonicalJson(Symbol("x")), /not canonicalizable/);
});

test("key order does not change the canonical form", () => {
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test("sha256Hex matches the known abc vector and is lowercase hex", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.match(sha256Hex("epoch"), /^[0-9a-f]{64}$/);
});

test("sha256Hex is sensitive to the input", () => {
  assert.notEqual(sha256Hex("a"), sha256Hex("b"));
  assert.equal(sha256Hex("a"), sha256Hex("a"));
});

test("sha256Canonical digests the canonical form", () => {
  assert.equal(sha256Canonical({ b: 2, a: 1 }), sha256Hex('{"a":1,"b":2}'));
});
