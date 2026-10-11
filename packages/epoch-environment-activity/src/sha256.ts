/**
 * Minimal, dependency-free SHA-256 (FIPS 180-4).
 *
 * W029 content digests are `sha256:<64 lowercase hex>` strings (see
 * canonical.ts). The implementation is intentionally self-contained so that
 * the determinism law (invariant 17) holds on every platform without native
 * dependencies: identical bytes in, identical digest out.
 */

import { TextEncoder } from "node:util";

const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a91a21,
  0x14292967, 0x06ca6351, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const INITIAL_HASH: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

let textEncoder: TextEncoder | undefined;

function bytesOf(message: string | Uint8Array): Uint8Array {
  if (typeof message === "string") {
    if (textEncoder === undefined) {
      textEncoder = new TextEncoder();
    }
    return textEncoder.encode(message);
  }
  return message;
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function hex8(value: number): string {
  return value.toString(16).padStart(8, "0");
}

function writeU32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

export function sha256Hex(message: string | Uint8Array): string {
  const input = bytesOf(message);
  const bitLength = input.length * 8;
  const total = Math.ceil((input.length + 9) / 64) * 64;
  const buffer = new Uint8Array(total);
  buffer.set(input);
  buffer[input.length] = 0x80;
  writeU32BE(buffer, total - 8, Math.floor(bitLength / 4294967296));
  writeU32BE(buffer, total - 4, bitLength % 4294967296);

  const w = new Uint32Array(64);
  let h0 = INITIAL_HASH[0];
  let h1 = INITIAL_HASH[1];
  let h2 = INITIAL_HASH[2];
  let h3 = INITIAL_HASH[3];
  let h4 = INITIAL_HASH[4];
  let h5 = INITIAL_HASH[5];
  let h6 = INITIAL_HASH[6];
  let h7 = INITIAL_HASH[7];

  for (let offset = 0; offset < total; offset += 64) {
    for (let t = 0; t < 16; t++) {
      const base = offset + t * 4;
      w[t] =
        ((buffer[base] << 24) |
          (buffer[base + 1] << 16) |
          (buffer[base + 2] << 8) |
          buffer[base + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const bigS1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + bigS1 + ch + K[t] + w[t]) >>> 0;
      const bigS0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (bigS0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => hex8(x)).join("");
}
