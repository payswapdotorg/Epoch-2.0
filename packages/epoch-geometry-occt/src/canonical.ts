import { createHash } from 'node:crypto';

/**
 * Canonical serialization for the determinism law.
 * - object keys sorted; arrays keep order; numbers rounded to 12 significant
 *   digits (kills -0 and cross-platform libm tails; documented canonical epsilon)
 * - no timestamps, no random values: shapes are content-addressed.
 * Node-only via node:crypto; a browser host would need an isomorphic digest (see report).
 */
export const CANONICAL_SIGNIFICANT_DIGITS = 12;

export function canonicalNumber(n: number): number {
  if (!Number.isFinite(n)) {
    throw new Error(`canonicalNumber: non-finite number ${String(n)}`);
  }
  const rounded = Number(n.toPrecision(CANONICAL_SIGNIFICANT_DIGITS));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function write(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'number':
      out.push(JSON.stringify(canonicalNumber(value)));
      return;
    case 'boolean':
    case 'string':
      out.push(JSON.stringify(value));
      return;
    case 'object': {
      if (Array.isArray(value)) {
        out.push('[');
        for (let i = 0; i < value.length; i++) {
          if (i > 0) out.push(',');
          write(value[i], out);
        }
        out.push(']');
        return;
      }
      if (isPlainObject(value)) {
        const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
        out.push('{');
        let first = true;
        for (const k of keys) {
          if (!first) out.push(',');
          first = false;
          out.push(JSON.stringify(k));
          out.push(':');
          write(value[k], out);
        }
        out.push('}');
        return;
      }
      out.push(JSON.stringify(String(value)));
      return;
    }
    default:
      out.push(JSON.stringify(String(value)));
  }
}

export function canonicalStringify(value: unknown): string {
  const out: string[] = [];
  write(value, out);
  return out.join('');
}

/** SHA-256 over the canonical serialization (content digest). */
export function contentDigest(value: unknown): string {
  return createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex');
}
