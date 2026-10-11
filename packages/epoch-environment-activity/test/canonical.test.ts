import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalJson,
  digestRecord,
  isDigestString,
  sha256Hex,
} from "../src/index.js";

test("sha256Hex matches FIPS 180-4 test vectors", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("canonicalJson is independent of object key insertion order", () => {
  const a = { a: 1, b: 2, nested: { y: 1, x: 2 } };
  const b = { nested: { x: 2, y: 1 }, b: 2, a: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(canonicalJson(a), '{"a":1,"b":2,"nested":{"x":2,"y":1}}');
});

test("canonicalJson preserves array order and rejects non-canonical values", () => {
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  const cycled: Record<string, unknown> = {};
  cycled.self = cycled;
  assert.throws(() => canonicalJson(cycled as never));
  assert.throws(() => digestRecord({ a: undefined }));
  assert.throws(() => digestRecord({ a: Symbol("x") }));
  assert.throws(() => digestRecord({ a: 10n }));
  assert.throws(() => digestRecord({ a: Number.NaN }));
  assert.throws(() => digestRecord({ a: new Date(0) }));
  class Instance {}
  assert.throws(() => digestRecord({ a: new Instance() }));
});

test("digestRecord produces sha256-prefixed digests and is stable", () => {
  const digest = digestRecord({ hello: "world", n: 3 });
  assert.ok(digest.startsWith("sha256:"));
  assert.equal(digest.length, "sha256:".length + 64);
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(digest, digestRecord({ n: 3, hello: "world" }));
  assert.notEqual(digest, digestRecord({ hello: "world", n: 4 }));
});

test("isDigestString validates the digest format", () => {
  assert.equal(isDigestString(`sha256:${"a".repeat(64)}`), true);
  assert.equal(isDigestString(`sha256:${"A".repeat(64)}`), false);
  assert.equal(isDigestString(`sha512:${"a".repeat(64)}`), false);
  assert.equal(isDigestString(`sha256:${"a".repeat(63)}`), false);
});
