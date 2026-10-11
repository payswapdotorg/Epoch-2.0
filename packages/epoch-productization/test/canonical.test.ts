import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CanonicalizationError,
  canonicalJson,
  compareStrings,
  digestCanonical,
  isHex64,
  sha256Hex,
} from "../src/contract.js";

test("canonicalJson: object key order does not matter", () => {
  assert.equal(
    canonicalJson({ a: 1, b: [true, null] }),
    canonicalJson({ b: [true, null], a: 1 }),
  );
});

test("canonicalJson: nested values serialize deterministically", () => {
  assert.equal(
    canonicalJson({ z: { b: 1, a: 2 }, a: [3, null, true, "x"] }),
    '{"a":[3,null,true,"x"],"z":{"a":2,"b":1}}',
  );
});

test("canonicalJson: string escaping matches JSON", () => {
  assert.equal(canonicalJson("aéb\u0000\"\\"), JSON.stringify("aéb\u0000\"\\"));
});

test("canonicalJson: undefined members are dropped", () => {
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
});

test("canonicalJson: undefined array items become null", () => {
  assert.equal(canonicalJson([1, undefined]), "[1,null]");
});

test("canonicalJson: rejects functions", () => {
  assert.throws(() => canonicalJson({ cb: () => 1 }), CanonicalizationError);
});

test("canonicalJson: rejects symbols, bigints and non-finite numbers", () => {
  assert.throws(() => canonicalJson({ s: Symbol("x") }), CanonicalizationError);
  assert.throws(() => canonicalJson({ n: 1n }), CanonicalizationError);
  assert.throws(() => canonicalJson([Number.NaN]), CanonicalizationError);
  assert.throws(
    () => canonicalJson([Number.POSITIVE_INFINITY]),
    CanonicalizationError,
  );
});

test("canonicalJson: rejects class instances and built-ins", () => {
  assert.throws(() => canonicalJson({ d: new Date(0) }), CanonicalizationError);
  assert.throws(() => canonicalJson({ m: new Map() }), CanonicalizationError);
  assert.throws(() => canonicalJson({ r: /x/ }), CanonicalizationError);
});

test("canonicalJson: detects cycles", () => {
  const value: Record<string, unknown> = { a: 1 };
  value["self"] = value;
  assert.throws(() => canonicalJson(value), CanonicalizationError);
  const array: unknown[] = [];
  array.push(array);
  assert.throws(() => canonicalJson({ array }), CanonicalizationError);
});

test("sha256Hex: known vectors", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("sha256Hex: bytes and utf8 text agree", () => {
  assert.equal(sha256Hex("ab"), sha256Hex(new Uint8Array([97, 98])));
});

test("digestCanonical: stable under key reordering", () => {
  assert.equal(
    digestCanonical({ a: { x: 1, y: 2 }, b: "z" }),
    digestCanonical({ b: "z", a: { y: 2, x: 1 } }),
  );
  assert.match(digestCanonical({ ok: true }), /^[0-9a-f]{64}$/);
});

test("isHex64: only 64 lowercase hex characters pass", () => {
  assert.equal(isHex64("a".repeat(64)), true);
  assert.equal(isHex64("A".repeat(64)), false);
  assert.equal(isHex64("a".repeat(63)), false);
  assert.equal(isHex64(42), false);
});

test("compareStrings: deterministic code-unit ordering", () => {
  assert.deepEqual(["b", "a", "B"].sort(compareStrings), ["B", "a", "b"]);
});
