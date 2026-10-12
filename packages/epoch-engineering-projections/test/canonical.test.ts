import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, sha256Hex, sha256Json } from "../src/index.js";
import type { JsonValue } from "../src/index.js";

test("canonicalJson sorts object keys recursively and emits compact form", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: true, c: null } }), '{"a":{"c":null,"d":true},"b":1}');
});

test("canonicalJson preserves array order", () => {
  assert.equal(canonicalJson([3, 1, { y: 2, x: 1 }]), '[3,1,{"x":1,"y":2}]');
});

test("canonicalJson serializes primitives, escapes and -0", () => {
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson(false), "false");
  assert.equal(canonicalJson(42), "42");
  assert.equal(canonicalJson(-0), "0");
  assert.equal(canonicalJson('a"b'), '"a\\"b"');
  assert.equal(canonicalJson("line\nbreak"), '"line\\nbreak"');
});

test("canonicalJson is deterministic under key insertion order", () => {
  assert.equal(canonicalJson({ x: 1, y: 2 }), canonicalJson({ y: 2, x: 1 }));
});

test("canonicalJson skips keys whose value is undefined", () => {
  assert.equal(canonicalJson({ a: undefined, b: 1 } as unknown as JsonValue), '{"b":1}');
});

test("sha256Hex matches known vectors via node:crypto", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("sha256Hex returns a lowercase 64-char hex digest", () => {
  assert.match(sha256Hex("epoch"), /^[0-9a-f]{64}$/);
});

test("sha256Json digests the canonical JSON form", () => {
  const value: JsonValue = { b: [1, "two", false], a: { nested: null } };
  assert.equal(sha256Json(value), sha256Hex(canonicalJson(value)));
});
