import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evidenceRefsFromDiscovered,
  fromDiscoveredCapability,
} from "./under-test.mjs";
import { DIGEST_A, DIGEST_B, DIGEST_C, NOT_A_DIGEST } from "./fixtures.mjs";

test("adapts a discovered capability declaration with evidence digests", () => {
  const discovered = {
    capabilityId: "capability/gltf-candidate",
    capabilityClass: "gltf-pipeline",
    version: "1.4.2",
    qualificationStatus: "named-task-qualified",
    evidence: [
      { digest: DIGEST_A },
      { digest: DIGEST_B },
      { digest: NOT_A_DIGEST },
    ],
  };
  const outcome = fromDiscoveredCapability(discovered, 42);
  assert.ok(outcome.ok);
  assert.equal(outcome.capability.capabilityId, "capability/gltf-candidate");
  assert.equal(outcome.capability.capabilityClass, "gltf-pipeline");
  assert.equal(outcome.capability.version, "1.4.2");
  assert.equal(outcome.capability.currentStatus, "named-task-qualified");
  assert.deepEqual(outcome.capability.measurements, []);
  assert.deepEqual(outcome.capability.evidence, [
    { digest: DIGEST_A, source: "discovery-evidence", capturedAtEpoch: 42 },
    { digest: DIGEST_B, source: "discovery-evidence", capturedAtEpoch: 42 },
  ]);
});

test("defaults missing status to prototype and missing version to 0", () => {
  const outcome = fromDiscoveredCapability(
    { capabilityId: "capability/x", capabilityClass: "gltf-pipeline" },
    7,
  );
  assert.ok(outcome.ok);
  assert.equal(outcome.capability.currentStatus, "prototype");
  assert.equal(outcome.capability.version, "0");
});

test("rejects declarations without a usable id", () => {
  const outcome = fromDiscoveredCapability(
    { capabilityClass: "gltf-pipeline" },
    7,
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "adapter/insufficient-declaration");
});

test("rejects declarations for unknown capability classes", () => {
  const outcome = fromDiscoveredCapability(
    { capabilityId: "capability/x", capabilityClass: "warp-drive" },
    7,
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "adapter/unknown-capability-class");
});

test("evidenceRefsFromDiscovered keeps only well-formed digests", () => {
  const refs = evidenceRefsFromDiscovered(
    [{ digest: DIGEST_C }, { digest: "nope" }, {}],
    9,
  );
  assert.deepEqual(refs, [
    { digest: DIGEST_C, source: "discovery-evidence", capturedAtEpoch: 9 },
  ]);
});
