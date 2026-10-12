import { test } from "node:test";
import { equal, match, notEqual, throws } from "node:assert/strict";
import { canonicalJson, canonicalSha256, sha256Hex } from "../src/index.js";
import type { CanonicalJsonValue } from "../src/index.js";

test("canonicalJson sorts object keys recursively", () => {
  equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test("canonicalJson emits no whitespace and preserves array order", () => {
  equal(canonicalJson({ x: [3, 1, 2], y: "s" }), '{"x":[3,1,2],"y":"s"}');
});

test("canonicalJson encodes primitives", () => {
  equal(canonicalJson(null), "null");
  equal(canonicalJson(true), "true");
  equal(canonicalJson(false), "false");
  equal(canonicalJson(42), "42");
  equal(canonicalJson("hi"), '"hi"');
});

test("canonicalJson rejects non-finite numbers", () => {
  throws(() => canonicalJson(Number.NaN), TypeError);
  throws(() => canonicalJson(Number.POSITIVE_INFINITY), TypeError);
});

test("canonicalJson rejects undefined property values", () => {
  const bad = { a: undefined } as unknown as CanonicalJsonValue;
  throws(() => canonicalJson(bad), TypeError);
});

test("sha256Hex produces well-known lowercase hex digests", () => {
  equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("canonicalSha256 is stable across key order", () => {
  const a = canonicalSha256({ x: 1, y: [true, null] });
  const b = canonicalSha256({ y: [true, null], x: 1 });
  equal(a, b);
  match(a, /^[0-9a-f]{64}$/);
});

test("canonicalSha256 differs when values differ", () => {
  notEqual(canonicalSha256({ x: 1 }), canonicalSha256({ x: 2 }));
});
