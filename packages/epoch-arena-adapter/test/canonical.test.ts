import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  digestOf,
  isHex64,
  isValidIso8601Utc,
  mintId,
  sha256Hex,
} from "../src/canonical.js";

test("sha256Hex matches known vectors (node:crypto, never hand-rolled)", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("canonicalJson sorts keys recursively and drops undefined", () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: 2, c: 3 } }),
    '{"a":{"c":3,"d":2},"b":1}',
  );
  assert.equal(canonicalJson({ a: undefined, b: 2 }), '{"b":2}');
  assert.equal(canonicalJson([3, { z: 1, y: null }]), '[3,{"y":null,"z":1}]');
});

test("canonicalJson rejects non-JSON values", () => {
  assert.throws(() => canonicalJson(Infinity), TypeError);
  assert.throws(() => canonicalJson(NaN), TypeError);
  assert.throws(() => canonicalJson(() => 1), TypeError);
  assert.throws(() => canonicalJson(BigInt(1)), TypeError);
});

test("digestOf is insensitive to key order", () => {
  assert.equal(digestOf({ a: 1, b: [2, 3] }), digestOf({ b: [2, 3], a: 1 }));
});

test("isHex64 validates shape", () => {
  assert.equal(isHex64("a".repeat(64)), true);
  assert.equal(isHex64("A".repeat(64)), false);
  assert.equal(isHex64("a".repeat(63)), false);
  assert.equal(isHex64(42), false);
});

test("mintId is prefix + 16 lowercase hex chars", () => {
  assert.match(mintId("atp", sha256Hex("x")), /^atp_[0-9a-f]{16}$/);
});

test("isValidIso8601Utc accepts only strict UTC forms", () => {
  assert.equal(isValidIso8601Utc("2026-02-01T00:00:00Z"), true);
  assert.equal(isValidIso8601Utc("2026-02-01T00:00:00.123Z"), true);
  assert.equal(isValidIso8601Utc("2026-02-01T00:00:00+01:00"), false);
  assert.equal(isValidIso8601Utc("2026-13-01T00:00:00Z"), false);
  assert.equal(isValidIso8601Utc("not-a-date"), false);
});
