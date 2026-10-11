import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";
import {
  classifyGap,
  GAP_ROUTES,
  InvalidRecordError,
  recordGap,
} from "../../packages/epoch-capability-learning/dist/index.js";
import type { GapFacts } from "../../packages/epoch-capability-learning/dist/index.js";
import { capabilityAlpha, capabilityBeta, episodeOne, hex } from "./helpers.js";

function baseFacts(): GapFacts {
  return {
    targetCapability: capabilityAlpha,
    intervention: episodeOne,
    occurredInEpoch: "epoch-e02",
    missingEvidenceKinds: [],
    environmentDefects: [],
    coveringCapability: null,
    verifiedDemonstration: null,
    reproduction: null,
  };
}

test("routes environment defects to environment-repair", () => {
  const facts = {
    ...baseFacts(),
    environmentDefects: [
      {
        defectKind: "stale-index",
        description: "episode index is stale",
        evidenceDigest: hex("defect-001"),
      },
    ],
  };
  const classification = classifyGap(facts);
  strictEqual(classification.route, "environment-repair");
  strictEqual(classification.ruleId, "rule/environment-repair");
  const reason = classification.reason;
  ok(reason.kind === "environment-repair");
  strictEqual(reason.defectCount, 1);
  deepStrictEqual(reason.defectKinds, ["stale-index"]);
});

test("routes missing evidence to evidence-request", () => {
  const facts = {
    ...baseFacts(),
    missingEvidenceKinds: ["episode-outcome", "capability-evidence"],
  };
  const classification = classifyGap(facts);
  strictEqual(classification.route, "evidence-request");
  const reason = classification.reason;
  ok(reason.kind === "evidence-request");
  deepStrictEqual(reason.missingEvidenceKinds, ["episode-outcome", "capability-evidence"]);
});

test("routes a covering capability to existing-capability", () => {
  const facts = { ...baseFacts(), coveringCapability: capabilityBeta };
  const classification = classifyGap(facts);
  strictEqual(classification.route, "existing-capability");
  const reason = classification.reason;
  ok(reason.kind === "existing-capability");
  strictEqual(reason.coveringCapabilityId, "cap/beta");
  strictEqual(reason.coveringCapabilityDigest, capabilityBeta.capabilityDigest);
});

test("routes a verified demonstration to demonstration", () => {
  const facts = {
    ...baseFacts(),
    verifiedDemonstration: { demonstrationDigest: hex("demo-009"), episodeId: "ep-001" },
  };
  const classification = classifyGap(facts);
  strictEqual(classification.route, "demonstration");
  const reason = classification.reason;
  ok(reason.kind === "demonstration");
  strictEqual(reason.demonstrationDigest, hex("demo-009"));
  strictEqual(reason.episodeId, "ep-001");
});

test("routes a reproduction fact to reproduction", () => {
  const facts = {
    ...baseFacts(),
    reproduction: {
      reproductionDigest: hex("repro-009"),
      reproducedInEpisodes: ["ep-001", "ep-002"],
    },
  };
  const classification = classifyGap(facts);
  strictEqual(classification.route, "reproduction");
  const reason = classification.reason;
  ok(reason.kind === "reproduction");
  deepStrictEqual(reason.reproducedInEpisodes, ["ep-001", "ep-002"]);
});

test("falls back to expert-escalation with exhausted routes", () => {
  const classification = classifyGap(baseFacts());
  strictEqual(classification.route, "expert-escalation");
  strictEqual(classification.ruleId, "rule/expert-escalation");
  const reason = classification.reason;
  ok(reason.kind === "expert-escalation");
  deepStrictEqual(
    reason.exhaustedRoutes,
    GAP_ROUTES.filter((route) => route !== "expert-escalation"),
  );
});

test("environment-repair outranks evidence-request", () => {
  const facts = {
    ...baseFacts(),
    missingEvidenceKinds: ["episode-outcome"],
    environmentDefects: [
      {
        defectKind: "stale-index",
        description: "episode index is stale",
        evidenceDigest: hex("defect-002"),
      },
    ],
  };
  const classification = classifyGap(facts);
  strictEqual(classification.route, "environment-repair");
  deepStrictEqual(classification.evaluatedRules, ["rule/environment-repair"]);
});

test("existing-capability outranks demonstration", () => {
  const facts = {
    ...baseFacts(),
    coveringCapability: capabilityBeta,
    verifiedDemonstration: { demonstrationDigest: hex("demo-009"), episodeId: "ep-001" },
  };
  const classification = classifyGap(facts);
  strictEqual(classification.route, "existing-capability");
  deepStrictEqual(classification.evaluatedRules, [
    "rule/environment-repair",
    "rule/evidence-request",
    "rule/existing-capability",
  ]);
});

test("classification and gap records are deterministic", () => {
  const facts = baseFacts();
  const first = classifyGap(facts);
  const second = classifyGap(facts);
  strictEqual(first.classificationDigest, second.classificationDigest);
  const gapOne = recordGap(facts, ["learned from episode ep-001"]);
  const gapTwo = recordGap(facts, ["learned from episode ep-001"]);
  strictEqual(gapOne.gapId, gapTwo.gapId);
  strictEqual(gapOne.factsDigest, gapTwo.factsDigest);
  strictEqual(gapOne.classification.route, "expert-escalation");
  deepStrictEqual(gapOne.notes, ["learned from episode ep-001"]);
});

test("recordGap rejects malformed digests", () => {
  const facts = {
    ...baseFacts(),
    targetCapability: { capabilityId: "cap/alpha", capabilityDigest: "not-a-digest" },
  };
  throws(() => recordGap(facts), InvalidRecordError);
});
