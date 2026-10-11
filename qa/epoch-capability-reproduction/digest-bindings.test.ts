import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  digestBenchmarkDescriptor,
  digestCandidateExport,
  digestDemonstration,
  digestRefOf,
  isDigestRef,
  sha256Hex,
} from "../../packages/epoch-capability-reproduction/src/index";
import {
  fakeBenchmarkDescriptor,
  fakeCandidateExport,
  fakeDemonstration,
  seedRef,
} from "./factories";

describe("canonical digesting", () => {
  it("sha256Hex matches the reference vector for abc", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("canonicalJson sorts object keys", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("canonicalJson preserves array order", () => {
    expect(canonicalJson([2, 1])).toBe("[2,1]");
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it("canonicalJson omits undefined object entries", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("canonicalJson rejects non-finite numbers", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
  });

  it("isDigestRef accepts only sha256 lowercase-hex refs", () => {
    expect(isDigestRef(seedRef("strict"))).toBe(true);
    expect(isDigestRef({ algorithm: "sha256", digest: "zz" })).toBe(false);
    expect(isDigestRef({ algorithm: "md5", digest: sha256Hex("md5") })).toBe(
      false,
    );
    expect(isDigestRef(null)).toBe(false);
  });
});

describe("frozen artifact bindings", () => {
  it("demonstrations bind by content", () => {
    const first = digestDemonstration(fakeDemonstration("demo-1"));
    const same = digestDemonstration(fakeDemonstration("demo-1"));
    const other = digestDemonstration(fakeDemonstration("demo-2"));
    expect(first.digest).toBe(same.digest);
    expect(first.digest).not.toBe(other.digest);
    expect(isDigestRef(first)).toBe(true);
  });

  it("candidate exports and benchmark descriptors bind by content", () => {
    const candidate = digestCandidateExport(fakeCandidateExport());
    const descriptor = digestBenchmarkDescriptor(fakeBenchmarkDescriptor());
    expect(isDigestRef(candidate)).toBe(true);
    expect(isDigestRef(descriptor)).toBe(true);
    expect(candidate.digest).not.toBe(descriptor.digest);
    expect(digestRefOf({}).digest).not.toBe(candidate.digest);
  });
});
