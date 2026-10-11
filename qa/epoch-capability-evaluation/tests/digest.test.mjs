import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, digestOf, isSha256Digest, sha256Hex } from "./under-test.mjs";

test("canonicalJson sorts object keys independently of insertion order", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ a: 2, b: 1 }), '{"a":2,"b":1}');
});

test("canonicalJson serializes primitives, arrays and nested objects deterministically", () => {
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson(false), "false");
  assert.equal(canonicalJson("x"), '"x"');
  assert.equal(canonicalJson(1), "1");
  assert.equal(canonicalJson(-0), "0");
  assert.equal(canonicalJson([1, "x", null, true]), '[1,"x",null,true]');
  assert.equal(canonicalJson({ a: { c: 1, b: [2, 3] } }), '{"a":{"b":[2,3],"c":1}}');
});

test("canonicalJson rejects non-finite numbers", () => {
  assert.throws(() => canonicalJson({ value: Number.NaN }));
  assert.throws(() => canonicalJson({ value: Number.POSITIVE_INFINITY }));
});

test("canonicalJson skips undefined-valued object keys", () => {
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
});

test("digestOf produces stable lowercase sha256 hex digests", () => {
  const value = { z: 1, a: [true, "s"] };
  const first = digestOf(value);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, digestOf({ a: [true, "s"], z: 1 }));
  assert.equal(first, sha256Hex(canonicalJson(value)));
});

test("isSha256Digest accepts well-formed digests and rejects malformed ones", () => {
  assert.equal(isSha256Digest("a".repeat(64)), true);
  assert.equal(isSha256Digest("0123456789abcdef".repeat(4)), true);
  assert.equal(isSha256Digest("A".repeat(64)), false);
  assert.equal(isSha256Digest("a".repeat(63)), false);
  assert.equal(isSha256Digest("z".repeat(64)), false);
  assert.equal(isSha256Digest(""), false);
});
