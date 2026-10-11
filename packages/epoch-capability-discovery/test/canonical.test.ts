import { describe, expect, it } from 'vitest';
import { canonicalDigest, canonicalJSON, deepFreeze, sha256Hex } from '../src/index.ts';

describe('canonical serialization and digests', () => {
  it('sha256Hex matches the known vector for the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('sha256Hex matches the known vector for "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('sha256Hex is stable for repeated input and distinct for different input', () => {
    expect(sha256Hex('a'.repeat(1000))).toBe(sha256Hex('a'.repeat(1000)));
    expect(sha256Hex('epoch')).not.toBe(sha256Hex('epoch!'));
  });

  it('canonicalJSON sorts object keys lexicographically', () => {
    const a = { z: 1, a: { y: 2, b: 3 } };
    const b = { a: { b: 3, y: 2 }, z: 1 };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
    expect(canonicalJSON(a)).toBe('{"a":{"b":3,"y":2},"z":1}');
  });

  it('canonicalJSON omits undefined-valued keys and rejects non-data values', () => {
    expect(canonicalJSON({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => canonicalJSON({ a: NaN })).toThrow();
    expect(() => canonicalJSON({ a: () => 1 })).toThrow();
    expect(() => canonicalJSON({ a: new Date(0) })).toThrow();
    expect(() => canonicalJSON([undefined])).toThrow();
  });

  it('canonicalDigest is invariant to property insertion order', () => {
    const first = canonicalDigest({ kind: 'task.completed', payloadDigest: 'd1', sourceRefs: [] });
    const second = canonicalDigest({ sourceRefs: [], payloadDigest: 'd1', kind: 'task.completed' });
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('deepFreeze freezes nested structures without changing values', () => {
    const value = deepFreeze({ list: [{ id: 'a' }], n: 1 });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.list[0])).toBe(true);
    expect(value.list[0]?.id).toBe('a');
    expect(value.n).toBe(1);
  });
});
