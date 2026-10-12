import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canonicalJson, sha256Canonical, sha256Hex } from "../src/index.js";

test("canonicalJson sorts object keys recursively and preserves array order", () => {
  const input = { z: 1, a: { d: [3, 1, 2], b: null }, m: "x" };
  assert.equal(canonicalJson(input), '{"a":{"b":null,"d":[3,1,2]},"m":"x","z":1}');
});

test("canonicalJson emits no whitespace and escapes strings like JSON", () => {
  assert.equal(canonicalJson({ b: true, a: 'he"llo' }), '{"a":"he\\"llo","b":true}');
  assert.equal(canonicalJson([]), "[]");
  assert.equal(canonicalJson({}), "{}");
});

test("canonicalJson rejects unsupported values", () => {
  assert.throws(() => canonicalJson(undefined));
  assert.throws(() => canonicalJson(() => 1));
  assert.throws(() => canonicalJson(new Date("2024-01-01T00:00:00Z")));
  assert.throws(() => canonicalJson(Number.NaN));
  assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY));
  assert.throws(() => canonicalJson({ a: undefined }));
  assert.throws(() => canonicalJson(1n));
  assert.throws(() => canonicalJson(Symbol("no")));
});

test("sha256Hex matches known vectors and yields lowercase hex", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.match(sha256Hex("epoch-foundation-blender"), /^[0-9a-f]{64}$/);
});

test("sha256Canonical is insertion-order independent", () => {
  const a = sha256Canonical({ tool: "blender", version: "4.2.0", formats: ["obj", "stl"] });
  const b = sha256Canonical({ formats: ["obj", "stl"], version: "4.2.0", tool: "blender" });
  assert.equal(a, b);
  assert.equal(a, sha256Hex('{"formats":["obj","stl"],"tool":"blender","version":"4.2.0"}'));
});
