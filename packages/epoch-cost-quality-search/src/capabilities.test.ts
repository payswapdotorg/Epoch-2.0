import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  capabilityPredictionContribution,
  prepareCapabilities,
  registryDigest,
  type RegisteredCapability,
} from "./index.js";

const capA: RegisteredCapability = {
  capabilityId: "cap-a",
  name: "Capability A",
  description: "first capability",
  provider: "@zcode/epoch-capability-evaluation",
  tags: ["alpha"],
  qualityAttributes: [
    { metricId: "p99-ms", value: 20, unit: "ms", direction: "minimize" },
  ],
};

const capB: RegisteredCapability = {
  capabilityId: "cap-b",
  name: "Capability B",
  description: "second capability",
  provider: "@zcode/epoch-reconstruction-policy",
  registrationDigest: "b".repeat(64),
  tags: ["beta"],
  qualityAttributes: [
    { metricId: "p99-ms", value: 8, unit: "ms", direction: "minimize" },
    { metricId: "hit-ratio", value: 0.9, unit: "ratio", direction: "maximize" },
  ],
};

describe("prepareCapabilities", () => {
  it("accepts valid declarations and sorts them by capabilityId", () => {
    const intake = prepareCapabilities([capB, capA]);
    assert.deepEqual(intake.capabilities.map((c) => c.capabilityId), [
      "cap-a",
      "cap-b",
    ]);
    assert.deepEqual(intake.issues, []);
  });

  it("reports duplicate capability ids and keeps the first occurrence", () => {
    const intake = prepareCapabilities([capA, { ...capA, name: "again" }]);
    assert.equal(intake.capabilities.length, 1);
    assert.equal(intake.capabilities[0].name, "Capability A");
    assert.deepEqual(intake.issues, [
      { kind: "duplicate-capability-id", capabilityId: "cap-a" },
    ]);
  });

  it("rejects invalid declarations and malformed attributes with typed issues", () => {
    const brokenValue: RegisteredCapability = {
      ...capA,
      qualityAttributes: [
        { metricId: "m1", value: Number.NaN, unit: "u", direction: "minimize" },
      ],
    };
    const intake = prepareCapabilities([capA, brokenValue]);
    assert.equal(intake.capabilities.length, 1);
    assert.equal(intake.issues.length, 1);
    assert.equal(intake.issues[0].kind, "invalid-capability");
    assert.ok(intake.issues[0].detail.includes("finite"));

    const dupAttr: RegisteredCapability = {
      ...capA,
      qualityAttributes: [
        { metricId: "m1", value: 1, unit: "u", direction: "minimize" },
        { metricId: "m1", value: 2, unit: "u", direction: "minimize" },
      ],
    };
    const dupIntake = prepareCapabilities([dupAttr]);
    assert.equal(dupIntake.capabilities.length, 0);
    assert.deepEqual(dupIntake.issues, [
      { kind: "duplicate-attribute", capabilityId: "cap-a", metricId: "m1" },
    ]);
  });

  it("rejects malformed registration digests", () => {
    const intake = prepareCapabilities([{ ...capB, registrationDigest: "xyz" }]);
    assert.equal(intake.capabilities.length, 0);
    assert.equal(intake.issues[0].kind, "invalid-capability");
    assert.ok(intake.issues[0].detail.includes("SHA-256"));
  });
});

describe("registryDigest", () => {
  it("computes registry digests insensitive to key order", () => {
    const first: RegisteredCapability = {
      capabilityId: "c1",
      name: "C1",
      description: "d",
      provider: "p",
      tags: ["t"],
      qualityAttributes: [
        { metricId: "m1", value: 1, unit: "u", direction: "minimize" },
      ],
    };
    const second: RegisteredCapability = {
      qualityAttributes: [
        { direction: "minimize", unit: "u", value: 1, metricId: "m1" },
      ],
      tags: ["t"],
      provider: "p",
      description: "d",
      name: "C1",
      capabilityId: "c1",
    };
    assert.equal(registryDigest([first]), registryDigest([second]));
    assert.notEqual(registryDigest([first]), registryDigest([capA]));
  });
});

describe("capabilityPredictionContribution", () => {
  it("maps capabilities to prediction contributions unchanged", () => {
    assert.deepEqual(capabilityPredictionContribution(capB), {
      capabilityId: "cap-b",
      attributes: capB.qualityAttributes,
    });
  });
});
