import { test } from "node:test";
import { ok, strictEqual, throws } from "node:assert";
import {
  canonicalJson,
  digestRecord,
  isValidDigest,
  sha256Hex,
} from "../../../packages/epoch-capability-learning/dist/index.js";

test("canonicalJson is deterministic and key-order-insensitive", () => {
  strictEqual(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  strictEqual(canonicalJson({ a: 1, b: 2 }), '{"a":1,"b":2}');
});

test("canonicalJson skips undefined values and preserves array order", () => {
  strictEqual(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
  strictEqual(canonicalJson([3, 1, 2]), "[3,1,2]");
});

test("canonicalJson rejects non-canonicalizable values", () => {
  throws(() => canonicalJson({ value: Number.NaN }));
  throws(() => canonicalJson({ value: 10n }));
});

test("sha256Hex matches published SHA-256 test vectors", () => {
  strictEqual(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  strictEqual(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("digestRecord is domain-separated and deterministic", () => {
  strictEqual(digestRecord("gap-facts", { a: 1 }), digestRecord("gap-facts", { a: 1 }));
  ok(digestRecord("gap-facts", { a: 1 }) !== digestRecord("gap-classification", { a: 1 }));
  ok(isValidDigest(digestRecord("gap-facts", { a: 1 })));
});

test("isValidDigest accepts only 64-character lowercase hex", () => {
  ok(isValidDigest("a".repeat(64)));
  ok(!isValidDigest("A".repeat(64)));
  ok(!isValidDigest("a".repeat(63)));
  ok(!isValidDigest("g".repeat(64)));
});
