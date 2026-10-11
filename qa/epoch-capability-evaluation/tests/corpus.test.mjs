import { test } from "node:test";
import assert from "node:assert/strict";
import { corpusDigestOf, validateCorpus } from "./under-test.mjs";
import { NOT_A_DIGEST, corpusFixture } from "./fixtures.mjs";

function corpusWithRights(rights) {
  const base = corpusFixture();
  return corpusFixture({ provenance: { ...base.provenance, rights } });
}

function corpusWithRepeatability(repeatability) {
  const base = corpusFixture();
  return corpusFixture({ provenance: { ...base.provenance, repeatability } });
}

test("accepts a rights-clear, repeatably-seeded corpus and returns its digest", () => {
  const validation = validateCorpus(corpusFixture());
  assert.equal(validation.ok, true);
  assert.match(validation.corpusDigest, /^[0-9a-f]{64}$/);
  assert.equal(validation.corpusDigest, corpusDigestOf(corpusFixture()));
});

test("rejects unclear rights (clarity: unclear)", () => {
  const validation = validateCorpus(
    corpusWithRights({ licenseId: "CC0-1.0", permitsBenchmarkUse: true, clarity: "unclear" }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/rights-unclear");
});

test("rejects unclear rights (empty license id)", () => {
  const validation = validateCorpus(
    corpusWithRights({ licenseId: "  ", permitsBenchmarkUse: true, clarity: "clear" }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/rights-unclear");
});

test("rejects rights that decline benchmark use", () => {
  const validation = validateCorpus(
    corpusWithRights({ licenseId: "Proprietary-1.0", permitsBenchmarkUse: false, clarity: "clear" }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/rights-declined");
});

test("rejects unverified repeatability provenance", () => {
  const validation = validateCorpus(corpusWithRepeatability({ kind: "unverified" }));
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/non-repeatable");
});

test("rejects deterministic-seeded provenance without a seed", () => {
  const validation = validateCorpus(
    corpusWithRepeatability({ kind: "deterministic-seeded", generatorId: "g", generatorVersion: "1", seed: "" }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/non-repeatable");
});

test("rejects recorded-artifacts provenance with zero items", () => {
  const base = corpusFixture();
  const validation = validateCorpus(
    corpusFixture({
      provenance: {
        ...base.provenance,
        repeatability: { kind: "recorded-artifacts", recorderId: "r", recorderVersion: "1" },
      },
      items: [],
    }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/empty");
});

test("rejects corpora with no items", () => {
  const validation = validateCorpus(corpusFixture({ items: [] }));
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/empty");
});

test("rejects malformed item digests", () => {
  const validation = validateCorpus(corpusFixture({ items: [{ id: "item-0001", contentDigest: NOT_A_DIGEST, bytes: 10 }] }));
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/bad-digest");
});

test("rejects duplicate item ids", () => {
  const validation = validateCorpus({
    ...corpusFixture(),
    items: [
      { id: "item-0001", contentDigest: "a".repeat(64), bytes: 10 },
      { id: "item-0001", contentDigest: "b".repeat(64), bytes: 20 },
    ],
  });
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/duplicate-artifact");
});

test("rejects malformed corpus identity", () => {
  const emptyId = validateCorpus(corpusFixture({ id: " " }));
  assert.equal(emptyId.ok, false);
  assert.equal(emptyId.rejection.code, "corpus/invalid-identity");
  const zeroVersion = validateCorpus(corpusFixture({ version: 0 }));
  assert.equal(zeroVersion.ok, false);
  assert.equal(zeroVersion.rejection.code, "corpus/invalid-identity");
});

test("rejects corpora for capability classes outside the registry", () => {
  const validation = validateCorpus(corpusFixture({ capabilityClass: "warp-drive" }));
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "corpus/unknown-capability-class");
});
