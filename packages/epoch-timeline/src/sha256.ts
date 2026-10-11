/**
 * Pure-TypeScript SHA-256 (FIPS 180-4). Implemented locally so timeline
 * digests are provider-neutral: no `node:crypto`, no native addons, and
 * byte-identical results in Node, Electron and browser hosts.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a57474, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** SHA-256 of the UTF-8 encoding of `input`, as lowercase hex. */
export function sha256Hex(input: string): string {
  return sha256HexOfBytes(encodeUtf8(input));
}

/** WHATWG-compatible UTF-8 encoder (no `TextEncoder` dependency). */
function encodeUtf8(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        const codePoint = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
        i += 1;
      } else {
        bytes.push(0xef, 0xbf, 0xbd); // lone surrogate -> U+FFFD
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes.push(0xef, 0xbf, 0xbd); // lone trailing surrogate -> U+FFFD
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(bytes);
}

function sha256HexOfBytes(message: Uint8Array): string {
  const bitLength = message.length * 8;
  const paddedLength = message.length + 1 + 8; // 0x80 sentinel + 8-byte bit length
  const totalLength = Math.ceil(paddedLength / 64) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const hi = Math.floor(bitLength / 2 ** 32);
  const lo = bitLength >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 8, hi);
  view.setUint32(totalLength - 4, lo);

  const hash = new Uint32Array(INITIAL_HASH);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let t = 0; t < 16; t += 1) {
      words[t] = view.getUint32(offset + t * 4);
    }
    for (let t = 16; t < 64; t += 1) {
      const w15 = words[t - 15] ?? 0;
      const w2 = words[t - 2] ?? 0;
      const sigma0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const sigma1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
      words[t] = (sigma0 + (words[t - 16] ?? 0) + (words[t - 7] ?? 0) + sigma1) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;

    for (let t = 0; t < 64; t += 1) {
      const bigSigma1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const choice = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + bigSigma1 + choice + (K[t] ?? 0) + (words[t] ?? 0)) >>> 0;
      const bigSigma0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (bigSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    hash[0] = (a + (hash[0] ?? 0)) >>> 0;
    hash[1] = (b + (hash[1] ?? 0)) >>> 0;
    hash[2] = (c + (hash[2] ?? 0)) >>> 0;
    hash[3] = (d + (hash[3] ?? 0)) >>> 0;
    hash[4] = (e + (hash[4] ?? 0)) >>> 0;
    hash[5] = (f + (hash[5] ?? 0)) >>> 0;
    hash[6] = (g + (hash[6] ?? 0)) >>> 0;
    hash[7] = (h + (hash[7] ?? 0)) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += (hash[i] ?? 0).toString(16).padStart(8, "0");
  }
  return hex;
}

function rotr(x: number, bits: number): number {
  return ((x >>> bits) | (x << (32 - bits))) >>> 0;
}
