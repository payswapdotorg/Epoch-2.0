/**
 * SHA-256 digests via node:crypto (repo convention — epoch-world-model
 * digest.ts and all merged packages use `createHash("sha256")`).
 *
 * W029 content digests are `sha256:<64 lowercase hex>` strings (see
 * canonical.ts). Determinism law (invariant 17): identical bytes in,
 * identical digest out — node:crypto guarantees this cross-platform.
 */

import { createHash } from "node:crypto";

export function sha256Hex(message: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof message === "string") {
    hash.update(message, "utf8");
  } else {
    hash.update(message);
  }
  return hash.digest("hex");
}
