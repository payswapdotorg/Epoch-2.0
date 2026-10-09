/**
 * node:crypto 浏览器 polyfill（W005）。
 *
 * epoch-world-model 的 computeWorldDigest 用 node:crypto.createHash('sha256')
 * 计算世界摘要（ARCHITECTURE-LOCK #17 确定性 fixture）。fixture 引擎在浏览器
 * 进程内运行（W005 req #2），而 node:crypto 在浏览器不可用——vite 默认外置会
 * 抛 "Module node:crypto has been externalized"。本 shim 仅实现
 * createHash('sha256').update(data,'utf8').digest('hex') 这一条路径，输出与
 * node:crypto 标准 SHA-256 完全一致（64 位小写 hex），保证跨进程确定性。
 *
 * 实现来源：FIPS 180-4 SHA-256；纯 JS，无依赖，确定性。
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Encode(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function sha256Hex(input: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const len = input.length;
  const bitLenHigh = Math.floor((len * 8) / 0x20000000);
  const bitLenLow = (len * 8) >>> 0;
  const withOne = len + 1;
  const remainder = withOne % 64;
  const padZeroCount = remainder <= 56 ? 56 - remainder : 120 - remainder;
  const total = withOne + padZeroCount + 8;
  const buf = new Uint8Array(total);
  buf.set(input);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, bitLenHigh >>> 0, false);
  dv.setUint32(total - 4, bitLenLow, false);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15 >>> 0, 7) ^ rotr(w15 >>> 0, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2 >>> 0, 17) ^ rotr(w2 >>> 0, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h[0] ?? 0;
    let b = h[1] ?? 0;
    let c = h[2] ?? 0;
    let d = h[3] ?? 0;
    let e = h[4] ?? 0;
    let f = h[5] ?? 0;
    let g = h[6] ?? 0;
    let hh = h[7] ?? 0;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e >>> 0, 6) ^ rotr(e >>> 0, 11) ^ rotr(e >>> 0, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = rotr(a >>> 0, 2) ^ rotr(a >>> 0, 13) ^ rotr(a >>> 0, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    const h0 = (h[0] ?? 0) + a;
    const h1 = (h[1] ?? 0) + b;
    const h2 = (h[2] ?? 0) + c;
    const h3 = (h[3] ?? 0) + d;
    const h4 = (h[4] ?? 0) + e;
    const h5 = (h[5] ?? 0) + f;
    const h6 = (h[6] ?? 0) + g;
    const h7 = (h[7] ?? 0) + hh;
    h.set([h0 >>> 0, h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0, h5 >>> 0, h6 >>> 0, h7 >>> 0]);
  }
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += (h[i] ?? 0).toString(16).padStart(8, "0");
  }
  return hex;
}

interface HashInstance {
  update(data: string | Uint8Array, encoding?: string): HashInstance;
  digest(encoding: string): string;
}

export function createHash(algorithm: string): HashInstance {
  if (algorithm !== "sha256") {
    throw new TypeError(`nodeCryptoShim: unsupported hash algorithm: ${algorithm}`);
  }
  let chunks: Uint8Array[] = [];
  let accumulated = 0;
  return {
    update(data: string | Uint8Array, encoding?: string): HashInstance {
      const enc = encoding ?? "utf8";
      if (enc !== "utf8" && enc !== "utf-8") {
        throw new TypeError(`nodeCryptoShim: unsupported encoding: ${enc}`);
      }
      const bytes = typeof data === "string" ? utf8Encode(data) : data;
      chunks.push(bytes);
      accumulated += bytes.length;
      return this;
    },
    digest(encoding: string): string {
      if (encoding !== "hex") {
        throw new TypeError(`nodeCryptoShim: unsupported digest encoding: ${encoding}`);
      }
      const merged = new Uint8Array(accumulated);
      let off = 0;
      for (const chunk of chunks) {
        merged.set(chunk, off);
        off += chunk.length;
      }
      chunks = [];
      accumulated = 0;
      return sha256Hex(merged);
    },
  };
}

export const createHashAlgorithm = "sha256";
