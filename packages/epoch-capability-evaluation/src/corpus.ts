// Corpus validation: rights + repeatability laws.
// Corpora with unclear rights or non-repeatable provenance are REJECTED with typed errors.
// Checks run in a fixed order; the first rejection wins (deterministic).
// The corpus rejection vocabulary lives here, beside its validator, and is
// re-exported by src/index.ts.

import type { BenchmarkCorpus } from "./contract.js";
import { digestOf, isSha256Digest } from "./digest.js";
import { metricIdsForClass } from "./catalog.js";

export type CorpusRejectionCode =
  | "corpus/invalid-identity"
  | "corpus/unknown-capability-class"
  | "corpus/rights-unclear"
  | "corpus/rights-declined"
  | "corpus/non-repeatable"
  | "corpus/empty"
  | "corpus/invalid-artifact"
  | "corpus/bad-digest"
  | "corpus/duplicate-artifact";

export type CorpusRejection = {
  readonly code: CorpusRejectionCode;
  readonly detail: string;
};

export type CorpusValidation =
  | { readonly ok: true; readonly corpusDigest: string }
  | { readonly ok: false; readonly rejection: CorpusRejection };

function reject(code: CorpusRejectionCode, detail: string): CorpusValidation {
  return { ok: false, rejection: { code, detail } };
}

export function validateCorpus(corpus: BenchmarkCorpus): CorpusValidation {
  if (
    typeof corpus.id !== "string" ||
    corpus.id.trim() === "" ||
    !Number.isInteger(corpus.version) ||
    corpus.version < 1
  ) {
    return reject(
      "corpus/invalid-identity",
      "corpus id must be non-empty and version a positive integer",
    );
  }
  if (metricIdsForClass(corpus.capabilityClass) === null) {
    return reject(
      "corpus/unknown-capability-class",
      `capability class ${corpus.capabilityClass} is not in the frozen registry`,
    );
  }
  const rights = corpus.provenance.rights;
  if (
    rights.clarity !== "clear" ||
    typeof rights.licenseId !== "string" ||
    rights.licenseId.trim() === ""
  ) {
    return reject(
      "corpus/rights-unclear",
      "license rights are not clearly declared",
    );
  }
  if (rights.permitsBenchmarkUse !== true) {
    return reject(
      "corpus/rights-declined",
      `license ${rights.licenseId} does not permit benchmark use`,
    );
  }
  const repeatability = corpus.provenance.repeatability;
  if (repeatability.kind === "unverified") {
    return reject(
      "corpus/non-repeatable",
      "provenance repeatability is unverified",
    );
  }
  if (
    repeatability.kind === "deterministic-seeded" &&
    (repeatability.generatorId.trim() === "" ||
      repeatability.generatorVersion.trim() === "" ||
      repeatability.seed.trim() === "")
  ) {
    return reject(
      "corpus/non-repeatable",
      "seeded provenance lacks a generator id/version or a seed",
    );
  }
  if (
    repeatability.kind === "recorded-artifacts" &&
    corpus.items.length === 0
  ) {
    return reject(
      "corpus/empty",
      "recorded-artifacts provenance requires at least one artifact item",
    );
  }
  if (corpus.items.length === 0) {
    return reject("corpus/empty", "corpus carries no items");
  }
  const seen = new Set<string>();
  for (const item of corpus.items) {
    if (
      typeof item.id !== "string" ||
      item.id.trim() === "" ||
      !Number.isInteger(item.bytes) ||
      item.bytes < 0
    ) {
      return reject(
        "corpus/invalid-artifact",
        "item identity/bytes are malformed",
      );
    }
    if (!isSha256Digest(item.contentDigest)) {
      return reject(
        "corpus/bad-digest",
        `item ${item.id} content digest is not a sha256 hex digest`,
      );
    }
    if (seen.has(item.id)) {
      return reject(
        "corpus/duplicate-artifact",
        `duplicate item id ${item.id}`,
      );
    }
    seen.add(item.id);
  }
  return { ok: true, corpusDigest: digestOf(corpus) };
}

/** Digest binding the complete corpus declaration (immutable once sealed). */
export function corpusDigestOf(corpus: BenchmarkCorpus): string {
  return digestOf(corpus);
}
