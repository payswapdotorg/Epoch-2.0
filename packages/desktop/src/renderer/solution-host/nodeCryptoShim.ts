/**
 * Browser-compatible synchronous `node:crypto` shim for the desktop renderer.
 *
 * 冻结的 @zcode/epoch-world-model `computeWorldDigest` 使用 `node:crypto.createHash`
 * 计算 SHA-256 世界摘要。桌面 renderer 进程为 contextIsolation + nodeIntegration:false，
 * Vite 把 `node:crypto` 当作浏览器外部依赖 externalize，运行时访问 `createHash` 抛错。
 *
 * 本 shim 提供纯 JS 同步 SHA-256 实现（标准 FIPS 180-4 算法，无网络/无 native 依赖），
 * 让确定性 fixture 引擎完全在 renderer 进程内运行（invariant 17：deterministic, network-free）。
 * 通过 vite.config.ts 的 resolve.alias 把 `node:crypto` 指向本文件。
 *
 * 只实现 fixture 路径需要的子集：createHash(algorithm).update(data, enc).digest(encoding)，
 * algorithm 固定 "sha256"，encoding 固定 "hex"。其他用法按需扩展。
 */

/** SHA-256 常量（FIPS 180-4 §4.2.2）。 */
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

const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // surrogate pair
      const next = text.charCodeAt(i + 1);
      code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
      i += 1;
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

function sha256(data: Uint8Array): string {
  // 预处理：补位 + 长度（FIPS 180-4 §5.1.1）。
  const bitLength = BigInt(data.length * 8);
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  // 末尾 8 字节为大端 64 位长度。
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, Number(bitLength & 0xffffffffn), false);
  view.setUint32(padded.length - 8, Number(bitLength >> 32n), false);

  const hash = new Uint32Array(INITIAL_HASH);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  // 输出 hex（大端）。
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += hash[i].toString(16).padStart(8, "0");
  }
  return hex;
}

interface HashInstance {
  update(data: string, inputEncoding?: string): HashInstance;
  digest(encoding: string): string;
}

/** createHash(algorithm) — 仅实现 sha256（fixture 路径唯一用例）。 */
export function createHash(algorithm: string): HashInstance {
  if (algorithm !== "sha256") {
    throw new Error(
      `nodeCryptoShim: unsupported algorithm "${algorithm}" (only sha256 implemented)`,
    );
  }
  let buffer = "";
  return {
    update(data: string, _inputEncoding?: string): HashInstance {
      buffer += data;
      return this;
    },
    digest(encoding: string): string {
      if (encoding !== "hex") {
        throw new Error(
          `nodeCryptoShim: unsupported digest encoding "${encoding}" (only hex implemented)`,
        );
      }
      return sha256(utf8Encode(buffer));
    },
  };
}

export default { createHash };
