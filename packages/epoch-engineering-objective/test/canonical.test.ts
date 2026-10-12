import { test } from "node:test";
import { ok, strictEqual, throws } from "node:assert";
import {
  canonicalJson,
  digestCanonical,
  isSha256Digest,
  sha256Hex,
  toSha256Digest,
} from "../src/canonical.js";

test("sha256Hex uses node:crypto (known vector)", () => {
  strictEqual(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("canonicalJson sorts keys recursively", () => {
  strictEqual(canonicalJson({ b: { d: 2, c: 1 }, a: 0 }), '{"a":0,"b":{"c":1,"d":2}}');
});

test("digestCanonical is key-order insensitive", () => {
  strictEqual(digestCanonical({ a: 1, b: [2, 3] }), digestCanonical({ b: [2, 3], a: 1 }));
});

test("isSha256Digest accepts only lowercase hex digests", () => {
  ok(isSha256Digest(sha256Hex("x")));
  ok(!isSha256Digest(sha256Hex("x").toUpperCase()));
  ok(!isSha256Digest("abc"));
});

test("toSha256Digest throws on malformed digests", () => {
  throws(() => toSha256Digest("nope"), TypeError);
});

test("canonicalJson rejects non-finite numbers", () => {
  throws(() => canonicalJson({ bad: Number.POSITIVE_INFINITY }), TypeError);
});

test("canonicalJson drops undefined properties and nulls undefined array items", () => {
  strictEqual(canonicalJson({ a: undefined, b: [undefined, 1] }), '{"b":[null,1]}');
});
