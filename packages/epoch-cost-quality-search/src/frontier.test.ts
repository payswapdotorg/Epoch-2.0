import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateFrontier,
  type HardConstraint,
  type LifecycleCost,
  type SolutionCandidate,
  type WeightedPreference,
} from "./index.js";

const revision = { worldId: "world-1", revisionDigest: "b".repeat(64) };

const mkCandidate = (
  candidateId: string,
  metrics: readonly {
    metricId: string;
    value: number;
    unit?: string;
    direction?: "minimize" | "maximize";
  }[],
): SolutionCandidate => ({
  candidateId,
  label: candidateId,
  description: `candidate ${candidateId}`,
  baselineRef: { solutionId: "sol-search", revisionDigest: "a".repeat(64) },
  worldRevision: revision,
  deltas: [],
  capabilityRefs: [],
  predictedMetrics: metrics.map((metric) => ({
    metricId: metric.metricId,
    value: metric.value,
    unit: metric.unit ?? "ms",
    direction: metric.direction ?? "minimize",
    basis: "capability-declaration" as const,
  })),
  metricIssues: [],
});

const ledger = (candidateId: string, amount: number): LifecycleCost => ({
  subjectId: candidateId,
  entries: [
    {
      entryId: `${candidateId}-cost`,
      subjectId: candidateId,
      category: "operating",
      description: "monthly operating cost",
      source: "finance estimate",
      asOfDate: "2026-02-01",
      currency: "USD",
      amount,
      uncertainty: { kind: "point" },
    },
  ],
});

const gbpLedger = (candidateId: string): LifecycleCost => ({
  subjectId: candidateId,
  entries: [
    {
      entryId: `${candidateId}-gbp`,
      subjectId: candidateId,
      category: "operating",
      description: "monthly operating cost",
      source: "finance estimate",
      asOfDate: "2026-02-01",
      currency: "GBP",
      amount: 5,
      uncertainty: { kind: "point" },
    },
  ],
});

const constraints: readonly HardConstraint[] = [
  {
    constraintId: "c-p99",
    kind: "performance",
    description: "p99 at most 10ms",
    source: "client SLO",
    metricId: "p99-ms",
    op: "<=",
    bound: 10,
    unit: "ms",
  },
];

const preferences: readonly WeightedPreference[] = [
  {
    preferenceId: "p-hit",
    description: "cache hits",
    metricId: "hit-ratio",
    direction: "maximize",
    weight: 2,
  },
  {
    preferenceId: "p-p99",
    description: "lower latency",
    metricId: "p99-ms",
    direction: "minimize",
    weight: 1,
  },
];

const scenarioCandidates: readonly SolutionCandidate[] = [
  mkCandidate("cand-a", [
    { metricId: "p99-ms", value: 5 },
    { metricId: "hit-ratio", value: 50, unit: "ratio", direction: "maximize" },
  ]),
  mkCandidate("cand-b", [
    { metricId: "p99-ms", value: 6 },
    { metricId: "hit-ratio", value: 50, unit: "ratio", direction: "maximize" },
  ]),
  mkCandidate("cand-c", [
    { metricId: "p99-ms", value: 3 },
    { metricId: "hit-ratio", value: 80, unit: "ratio", direction: "maximize" },
  ]),
  mkCandidate("cand-cheap-bad", [{ metricId: "p99-ms", value: 20 }]),
  mkCandidate("cand-gbp", [
    { metricId: "p99-ms", value: 5 },
    { metricId: "hit-ratio", value: 70, unit: "ratio", direction: "maximize" },
  ]),
  mkCandidate("cand-missing", []),
  mkCandidate("cand-nocost", [
    { metricId: "p99-ms", value: 5 },
    { metricId: "hit-ratio", value: 60, unit: "ratio", direction: "maximize" },
  ]),
  mkCandidate("cand-nopref", [{ metricId: "p99-ms", value: 5 }]),
  mkCandidate("cand-unit", [{ metricId: "p99-ms", value: 0.005, unit: "s" }]),
];

const scenarioCosts: readonly LifecycleCost[] = [
  ledger("cand-a", 100),
  ledger("cand-b", 100),
  ledger("cand-c", 200),
  ledger("cand-cheap-bad", 1),
  gbpLedger("cand-gbp"),
  ledger("cand-missing", 10),
  ledger("cand-nopref", 50),
  ledger("cand-unit", 5),
];

const runScenario = () =>
  evaluateFrontier(scenarioCandidates, constraints, preferences, scenarioCosts);

const byId = (candidateId: string) => {
  const result = runScenario();
  const found = result.evaluated.find((e) => e.candidateId === candidateId);
  assert.ok(found !== undefined, `missing evaluation for ${candidateId}`);
  return found;
};

describe("evaluateFrontier", () => {
  it("rejects the cheapest candidate when any hard constraint fails, regardless of price", () => {
    const cheapBad = byId("cand-cheap-bad");
    assert.equal(cheapBad.status, "rejected");
    assert.ok(cheapBad.cost !== null);
    assert.equal(cheapBad.cost.totalPoint, 1);
    assert.deepEqual(cheapBad.rejectionReasons, [
      {
        kind: "constraint-violation",
        constraintId: "c-p99",
        constraintKind: "performance",
        metricId: "p99-ms",
        observed: 20,
        op: "<=",
        bound: 10,
      },
    ]);
  });

  it("fails closed on missing constrained metrics and unit mismatches", () => {
    const missing = byId("cand-missing");
    assert.equal(missing.status, "rejected");
    assert.deepEqual(missing.rejectionReasons, [
      {
        kind: "constraint-metric-unavailable",
        constraintId: "c-p99",
        metricId: "p99-ms",
      },
    ]);
    const unit = byId("cand-unit");
    assert.equal(unit.status, "rejected");
    assert.deepEqual(unit.rejectionReasons, [
      {
        kind: "constraint-unit-mismatch",
        constraintId: "c-p99",
        metricId: "p99-ms",
        constraintUnit: "ms",
        readingUnit: "s",
      },
    ]);
  });

  it("classifies the Pareto frontier and names the dominator of dominated candidates", () => {
    assert.equal(byId("cand-a").status, "frontier");
    assert.equal(byId("cand-c").status, "frontier");
    const dominated = byId("cand-b");
    assert.equal(dominated.status, "dominated");
    assert.equal(dominated.dominatorCandidateId, "cand-a");
  });

  it("keeps candidates with missing preference metrics incomparable on the frontier", () => {
    const nopref = byId("cand-nopref");
    assert.equal(nopref.status, "frontier");
    assert.deepEqual(nopref.incompleteObjectives, ["hit-ratio"]);
    assert.deepEqual(
      nopref.objectives.map((objective) => objective.objectiveId),
      ["lifecycle-cost", "p99-ms"],
    );
  });

  it("ranks the frontier by weighted preference score with deterministic tie-breaks", () => {
    const result = runScenario();
    assert.deepEqual(result.rankedFrontier, [
      { rank: 1, candidateId: "cand-c", preferenceScoreTotal: 3 },
      { rank: 2, candidateId: "cand-a", preferenceScoreTotal: 1 / 3 },
      { rank: 3, candidateId: "cand-nopref", preferenceScoreTotal: 1 / 3 },
    ]);
  });

  it("never rejects a candidate for preference reasons (weights are data)", () => {
    const result = runScenario();
    for (const evaluation of result.evaluated) {
      for (const reason of evaluation.rejectionReasons) {
        assert.ok(!reason.kind.includes("preference"));
      }
    }
    // cand-a scores 0 on the hit-ratio preference yet remains feasible
    assert.equal(result.evaluated[0].status, "frontier");
    assert.equal(result.evaluated[0].candidateId, "cand-a");
  });

  it("rejects candidates with missing or unconvertible cost records", () => {
    const nocost = byId("cand-nocost");
    assert.equal(nocost.status, "rejected");
    assert.deepEqual(nocost.rejectionReasons, [
      { kind: "cost-record-missing" },
    ]);
    const gbp = byId("cand-gbp");
    assert.equal(gbp.status, "rejected");
    assert.deepEqual(gbp.rejectionReasons, [
      { kind: "cost-unconvertible", currencies: ["GBP"] },
    ]);
  });

  it("orders all outputs deterministically by candidateId", () => {
    const result = runScenario();
    const ids = result.evaluated.map((evaluation) => evaluation.candidateId);
    assert.deepEqual(ids, [...ids].sort());
    assert.deepEqual(result.frontierCandidateIds, [
      "cand-a",
      "cand-c",
      "cand-nopref",
    ]);
    assert.deepEqual(result.objectiveIds, [
      "hit-ratio",
      "lifecycle-cost",
      "p99-ms",
    ]);
    assert.equal(result.reportingCurrency, "USD");
  });

  it("rejects duplicate candidate ids after the first occurrence", () => {
    const candA = scenarioCandidates[0];
    const result = evaluateFrontier([candA, candA], constraints, preferences, [
      ledger("cand-a", 100),
    ]);
    assert.equal(result.evaluated.length, 2);
    assert.equal(result.evaluated[0].status, "frontier");
    assert.equal(result.evaluated[1].status, "rejected");
    assert.deepEqual(result.evaluated[1].rejectionReasons, [
      { kind: "duplicate-candidate-id" },
    ]);
  });
});
