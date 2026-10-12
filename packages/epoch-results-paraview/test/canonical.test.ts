import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalDigest, canonicalJson, sha256Hex } from "../src/canonical.js";

test("canonicalJson sorts object keys recursively", () => {
  const value = { z: 1, a: { y: true, b: [2, 1] } };
  assert.equal(canonicalJson(value), '{"a":{"b":[2,1],"y":true},"z":1}');
});

test("canonicalJson emits no whitespace", () => {
  const value = { name: "alpha", nested: { deep: [1, 2, 3] } };
  assert.equal(canonicalJson(value), '{"name":"alpha","nested":{"deep":[1,2,3]}}');
});

test("canonicalJson is independent of key insertion order", () => {
  const left = { a: 1, b: 2, c: 3 };
  const right = { c: 3, b: 2, a: 1 };
  assert.equal(canonicalJson(left), canonicalJson(right));
});

test("canonicalJson preserves array order", () => {
  assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
});

test("canonicalJson serializes null, booleans and strings", () => {
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson(false), "false");
  assert.equal(canonicalJson("x"), '"x"');
});

test("canonicalJson maps non-finite numbers to null", () => {
  assert.equal(canonicalJson({ a: Number.NaN }), '{"a":null}');
});

test("sha256Hex matches known vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("sha256Hex returns lowercase hex of length 64", () => {
  const digest = sha256Hex("epoch-results-paraview");
  assert.match(digest, /^[0-9a-f]{64}$/);
});

test("canonicalDigest equals sha256 over canonicalJson", () => {
  const value = { b: 2, a: 1 };
  assert.equal(canonicalDigest(value), sha256Hex(canonicalJson(value)));
});
