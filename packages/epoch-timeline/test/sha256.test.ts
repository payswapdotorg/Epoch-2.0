import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256Hex } from "../src/index.js";

test("sha256: empty input matches the FIPS 180-4 test vector", () => {
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("sha256: 'abc' matches the FIPS 180-4 test vector", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("sha256: 56-byte NIST vector matches (padding boundary case)", () => {
  assert.equal(
    sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
});

test("sha256: deterministic across calls and block boundaries", () => {
  const long = "a".repeat(1000); // spans multiple 64-byte blocks
  assert.equal(sha256Hex(long), sha256Hex(long));
  assert.match(sha256Hex(long), /^[0-9a-f]{64}$/);
  const edge55 = "b".repeat(55); // exactly fills one block after padding
  const edge56 = "b".repeat(56); // forces a second padding block
  assert.notEqual(sha256Hex(edge55), sha256Hex(edge56));
  assert.match(sha256Hex(edge55), /^[0-9a-f]{64}$/);
  assert.match(sha256Hex(edge56), /^[0-9a-f]{64}$/);
});

test("sha256: UTF-8 multibyte input is stable", () => {
  const input = "τïmélïne-🚧-nœst";
  assert.equal(sha256Hex(input), sha256Hex(input));
  assert.match(sha256Hex(input), /^[0-9a-f]{64}$/);
});
