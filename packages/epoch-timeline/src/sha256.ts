/**
 * SHA-256 digests for the timeline authority.
 *
 * Convention (W001 `epoch-world-model` digest.ts, W011
 * `epoch-geometry-occt` canonical.ts): hashing goes through `node:crypto`
 * `createHash("sha256")` — the frozen packages never hand-roll hashing.
 * The UTF-8 encoding and the lowercase-hex output are part of the digest
 * contract; determinism is inherited from the platform implementation.
 */
import { createHash } from "node:crypto";

/** SHA-256 of the UTF-8 encoding of `input`, as lowercase hex. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
