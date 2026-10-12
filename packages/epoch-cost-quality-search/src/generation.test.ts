import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  candidateContentDigest,
  deriveProposalRevision,
  generateAlternatives,
  resolveCapabilityRefs,
  type RegisteredCapability,
  type RequirementSet,
  type SolutionBaseline,
  type SolutionCandidate,
} from "./index.js";

const baseline: SolutionBaseline = {
  solutionId: "sol-search",
  name: "Search service",
  description: "Baseline search deployment",
  worldRevision: {
    worldId: "world-1",
    revisionDigest: "a".repeat(64),
  },
  capabilityRefs: ["cap-index"],
  notes: [],
};

const registry: RegisteredCapability[] = [
  {
    capabilityId: "cap-index",
    name: "Standard index",
    description: "Baseline index",
    provider: "@zcode/epoch-capability-evaluation",
    tags: ["storage"],
    qualityAttributes: [
      { metricId: "p99-ms", value: 40, unit: "ms", direction: "minimize" },
    ],
  },
  {
    capabilityId: "cap-fast-index",
    name: "Fast index",
    description: "Lower-latency index",
    provider: "@zcode/epoch-capability-evaluation",
    tags: ["storage"],
    qualityAttributes: [
      { metricId: "p99-ms", value: 12, unit: "ms", direction: "minimize" },
    ],
  },
  {
    capabilityId: "cap-cache",
    name: "Edge cache",
    description: "Adds cache hit ratio",
    provider: "@zcode/epoch-capability-evaluation",
    tags: ["cache"],
    qualityAttributes: [
      {
        metricId: "hit-ratio",
        value: 0.9,
        unit: "ratio",
        direction: "maximize",
      },
    ],
  },
];

const requirements: RequirementSet = {
  constraints: [
    {
      constraintId: "c-p99",
      kind: "performance",
      description: "p99 under 50ms",
      source: "client SLO",
      metricId: "p99-ms",
      op: "<=",
      bound: 50,
      unit: "ms",
    },
  ],
  preferences: [
    {
      preferenceId: "p-hit",
      description: "prefer higher cache hit ratio",
      metricId: "hit-ratio",
      direction: "maximize",
      weight: 2,
    },
  ],
};

const findCandidate = (
  candidates: readonly SolutionCandidate[],
  candidateId: string,
): SolutionCandidate => {
  const found = candidates.find((c) => c.candidateId === candidateId);
  assert.ok(found !== undefined, `missing candidate ${candidateId}`);
  return found;
};

describe("generateAlternatives", () => {
  it("emits the baseline itself as an identity candidate with zero deltas", () => {
    const result = generateAlternatives(baseline, requirements, registry);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.registryIssues, []);
    const identity = findCandidate(result.candidates, "sol-search::baseline");
    assert.deepEqual(identity.deltas, []);
    assert.deepEqual(identity.worldRevision, baseline.worldRevision);
    assert.deepEqual(identity.baselineRef, {
      solutionId: "sol-search",
      revisionDigest: baseline.worldRevision.revisionDigest,
    });
    assert.deepEqual(identity.predictedMetrics, [
      {
        metricId: "p99-ms",
        value: 40,
        unit: "ms",
        direction: "minimize",
        basis: "capability-declaration",
      },
    ]);
  });

  it("gives generated candidates their own revision identity while naming the baseline revision", () => {
    const result = generateAlternatives(baseline, requirements, registry);
    const added = findCandidate(result.candidates, "sol-search::add:cap-cache");
    // Digest STRINGS are compared: revision identity is about the digest
    // value, not object references.
    assert.notEqual(
      added.worldRevision.revisionDigest,
      baseline.worldRevision.revisionDigest,
    );
    assert.equal(added.worldRevision.worldId, "world-1");
    assert.equal(
      added.baselineRef.revisionDigest,
      baseline.worldRevision.revisionDigest,
    );
    const deltas = [{ kind: "add-capability", capabilityId: "cap-cache" }] as const;
    const refs = ["cap-cache", "cap-index"];
    const first = deriveProposalRevision(baseline, deltas, refs);
    const second = deriveProposalRevision(baseline, deltas, refs);
    assert.equal(first.revisionDigest, second.revisionDigest);
    assert.notEqual(
      deriveProposalRevision(baseline, [], refs).revisionDigest,
      first.revisionDigest,
    );
    // Every delta candidate carries a revision digest DISTINCT from the
    // baseline's — separate revision identity, never a silent replacement.
    for (const candidate of result.candidates) {
      if (candidate.deltas.length === 0) {
        continue;
      }
      assert.notEqual(
        candidate.worldRevision.revisionDigest,
        baseline.worldRevision.revisionDigest,
      );
    }
  });

  it("composes add candidates from registered capabilities only", () => {
    const result = generateAlternatives(baseline, requirements, registry);
    const registryIds = new Set(registry.map((c) => c.capabilityId));
    for (const candidate of result.candidates) {
      for (const ref of candidate.capabilityRefs) {
        assert.ok(
          registryIds.has(ref),
          `candidate ${candidate.candidateId} references unregistered ${ref}`,
        );
      }
    }
    const fast = findCandidate(
      result.candidates,
      "sol-search::add:cap-fast-index",
    );
    assert.deepEqual(fast.capabilityRefs, ["cap-fast-index", "cap-index"]);
    assert.deepEqual(fast.predictedMetrics, [
      {
        metricId: "p99-ms",
        value: 40,
        unit: "ms",
        direction: "minimize",
        basis: "capability-declaration",
      },
    ]);
  });

  it("composes replace candidates on metric overlap or requirement coverage", () => {
    const result = generateAlternatives(baseline, requirements, registry);
    const byMetric = findCandidate(
      result.candidates,
      "sol-search::replace:cap-index->cap-fast-index",
    );
    assert.deepEqual(byMetric.capabilityRefs, ["cap-fast-index"]);
    assert.deepEqual(byMetric.predictedMetrics, [
      {
        metricId: "p99-ms",
        value: 12,
        unit: "ms",
        direction: "minimize",
        basis: "capability-declaration",
      },
    ]);
    const byRequirement = findCandidate(
      result.candidates,
      "sol-search::replace:cap-index->cap-cache",
    );
    assert.deepEqual(byRequirement.capabilityRefs, ["cap-cache"]);
  });

  it("is deterministic across repeated generation", () => {
    const first = generateAlternatives(baseline, requirements, registry);
    const second = generateAlternatives(baseline, requirements, registry);
    assert.deepEqual(first.candidates, second.candidates);
    assert.deepEqual(first.issues, second.issues);
    for (let index = 0; index < first.candidates.length; index += 1) {
      assert.equal(
        candidateContentDigest(first.candidates[index]),
        candidateContentDigest(second.candidates[index]),
      );
    }
  });

  it("reports unknown baseline capability refs without inventing predictions", () => {
    const ghostBaseline = { ...baseline, capabilityRefs: ["cap-ghost"] };
    const result = generateAlternatives(ghostBaseline, requirements, registry);
    assert.deepEqual(result.issues, [
      { kind: "unknown-baseline-capability", capabilityId: "cap-ghost" },
    ]);
    const identity = findCandidate(result.candidates, "sol-search::baseline");
    assert.deepEqual(identity.predictedMetrics, []);
    assert.deepEqual(identity.metricIssues, []);
  });
});

describe("resolveCapabilityRefs", () => {
  it("applies add, remove and replace deltas in order", () => {
    assert.deepEqual(
      resolveCapabilityRefs(["a", "b"], [
        { kind: "add-capability", capabilityId: "c" },
        { kind: "remove-capability", capabilityId: "a" },
        { kind: "replace-capability", fromCapabilityId: "b", toCapabilityId: "d" },
      ]),
      ["c", "d"],
    );
    assert.deepEqual(
      resolveCapabilityRefs(["a"], [
        { kind: "replace-capability", fromCapabilityId: "x", toCapabilityId: "y" },
      ]),
      ["a", "y"],
    );
    assert.deepEqual(
      resolveCapabilityRefs(["a"], [
        { kind: "remove-capability", capabilityId: "missing" },
      ]),
      ["a"],
    );
  });
});
