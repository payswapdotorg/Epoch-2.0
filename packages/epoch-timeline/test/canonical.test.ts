import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, isTimelineError } from "../src/index.js";

test("canonicalJson: sorts object keys recursively", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: [3, 2], b: true } }),
    '{"a":{"b":true,"y":[3,2]},"z":1}',
  );
});

test("canonicalJson: preserves array order", () => {
  assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
  assert.equal(canonicalJson([]), "[]");
  assert.equal(canonicalJson({}), "{}");
});

test("canonicalJson: is independent of key insertion order", () => {
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test("canonicalJson: omits undefined members and matches JSON string escaping", () => {
  const tricky = 'quote " and \\ backslash';
  assert.equal(canonicalJson(tricky), JSON.stringify(tricky));
  assert.equal(
    canonicalJson({ a: undefined, b: null, c: 0.25, d: "x" }),
    '{"b":null,"c":0.25,"d":"x"}',
  );
});

test("canonicalJson: rejects non-finite numbers and non-JSON containers with typed errors", () => {
  assert.throws(
    () => canonicalJson({ bad: Number.NaN }),
    (err) => isTimelineError(err) && err.code === "serialization-invalid",
  );
  assert.throws(
    () => canonicalJson(new Map([["a", 1]])),
    (err) => isTimelineError(err) && err.code === "serialization-invalid",
  );
});
