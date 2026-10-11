/**
 * SHA-256, hex output — via node:crypto, per repo convention
 * (W001 epoch-world-model digest.ts, W011 epoch-geometry-occt canonical.ts).
 * Never hand-roll hashing.
 */
import { createHash } from 'node:crypto';

/** SHA-256 of the UTF-8 encoding of `input`, as lowercase hex. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
