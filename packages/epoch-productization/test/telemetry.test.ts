import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TELEMETRY_POLICY,
  TelemetryContractError,
  canonicalJson,
  createTelemetryEvent,
  createTelemetryPolicy,
  deploymentPlanSummaryEvents,
  deriveDeploymentPlan,
  formatTelemetryBatch,
  formatTelemetryLine,
  packageManifestSummaryEvents,
  scanForSecrets,
  secretScanSummaryEvent,
  serializeTelemetryEvent,
  storeIntegritySummaryEvents,
  telemetryEventDigest,
  verifyStoreIntegrity,
  type PackageManifest,
} from "../src/contract.js";

function planForTwoTargets() {
  return deriveDeploymentPlan({
    kind: "deployment-plan-input",
    version: "1.2.3",
    commit: "0123456789abcdef0123456789abcdef01234567",
    targetIds: ["web-static", "desktop-linux-x64"],
  });
}

test("createTelemetryEvent: accepts valid events", () => {
  const event = createTelemetryEvent({
    category: "integrity",
    name: "store.integrity.worlds",
    count: 3,
    unit: "worlds",
  });
  assert.equal(event.kind, "telemetry-event");
  assert.equal(event.count, 3);
  assert.equal(Object.isFrozen(event), true);
});

test("createTelemetryEvent: rejects unknown categories", () => {
  assert.throws(
    () =>
      createTelemetryEvent({
        category: "nope",
        name: "a.name",
        count: 1,
        unit: "worlds",
      }),
    TelemetryContractError,
  );
});

test("createTelemetryEvent: rejects malformed names", () => {
  for (const name of ["Xy", "bad name", "a.b.c.d.e.f", ""]) {
    assert.throws(
      () =>
        createTelemetryEvent({ category: "release", name, count: 1, unit: "events" }),
      TelemetryContractError,
      name,
    );
  }
});

test("createTelemetryEvent: rejects bad counts", () => {
  for (const count of [-1, 1.5, 1e12]) {
    assert.throws(
      () =>
        createTelemetryEvent({ category: "release", name: "a.b", count, unit: "events" }),
      TelemetryContractError,
      String(count),
    );
  }
});

test("createTelemetryEvent: rejects unknown units", () => {
  assert.throws(
    () =>
      createTelemetryEvent({ category: "release", name: "a.b", count: 1, unit: "kg" }),
    TelemetryContractError,
  );
});

test("default policy is disabled, local, and cannot transmit remotely", () => {
  assert.equal(DEFAULT_TELEMETRY_POLICY.enabled, false);
  assert.equal(DEFAULT_TELEMETRY_POLICY.sink, "local-stderr");
  assert.equal(DEFAULT_TELEMETRY_POLICY.sinkPath, null);
  assert.equal(DEFAULT_TELEMETRY_POLICY.remoteTransmission, false);
  assert.equal(DEFAULT_TELEMETRY_POLICY.payloadLaw, "counts-and-labels-only");
  assert.equal(DEFAULT_TELEMETRY_POLICY.consent, "explicit-opt-in");
});

test("createTelemetryPolicy: validates sink combinations", () => {
  assert.throws(
    () => createTelemetryPolicy({ enabled: true, sink: "local-file", sinkPath: null }),
    TelemetryContractError,
  );
  assert.throws(
    () => createTelemetryPolicy({ enabled: true, sink: "local-stderr", sinkPath: "out.txt" }),
    TelemetryContractError,
  );
  assert.throws(
    () => createTelemetryPolicy({ enabled: true, sink: "local-file", sinkPath: "../out.txt" }),
    TelemetryContractError,
  );
  assert.throws(
    () => createTelemetryPolicy({ enabled: true, sink: "remote-http", sinkPath: null }),
    TelemetryContractError,
  );
  const policy = createTelemetryPolicy({
    enabled: true,
    sink: "local-file",
    sinkPath: "qa/epoch-productization/telemetry.log",
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.remoteTransmission, false);
});

test("formatTelemetryLine: fixed field order", () => {
  const event = createTelemetryEvent({
    category: "integrity",
    name: "store.integrity.worlds",
    count: 3,
    unit: "worlds",
  });
  assert.equal(
    formatTelemetryLine(event),
    "epoch-telemetry|1|integrity|store.integrity.worlds|3|worlds",
  );
});

test("formatTelemetryBatch: deterministic ordering", () => {
  const first = createTelemetryEvent({ category: "security", name: "b.name", count: 2, unit: "findings" });
  const second = createTelemetryEvent({ category: "integrity", name: "a.name", count: 1, unit: "worlds" });
  const third = createTelemetryEvent({ category: "security", name: "a.name", count: 5, unit: "findings" });
  assert.equal(
    formatTelemetryBatch([first, second, third]),
    formatTelemetryBatch([third, second, first]),
  );
});

test("serializeTelemetryEvent: canonical JSON with a stable digest", () => {
  const event = createTelemetryEvent({
    category: "release",
    name: "release.checklist.gates",
    count: 7,
    unit: "gates",
  });
  assert.equal(serializeTelemetryEvent(event), canonicalJson(event));
  assert.equal(telemetryEventDigest(event), telemetryEventDigest(event));
  assert.match(telemetryEventDigest(event), /^[0-9a-f]{64}$/);
});

test("storeIntegritySummaryEvents: counts only, never content", () => {
  const report = verifyStoreIntegrity({
    listWorlds: () => ["w1"],
    listRecords: () => [],
    readWorld: () => ({ id: "w1", label: "WORLD-CONTENT-MARKER" }),
    readRecord: () => null,
    declaredDigest: () => null,
  });
  const events = storeIntegritySummaryEvents(report);
  assert.deepEqual(
    events.map((event) => event.count),
    [1, 0, 0, 0],
  );
  const batch = formatTelemetryBatch(events);
  assert.equal(batch.includes("WORLD-CONTENT-MARKER"), false);
});

test("secretScanSummaryEvent: counts findings", () => {
  const findings = scanForSecrets("GITHUB_TOKEN=abc123def456ghi789"); // epoch-scan-ignore
  assert.equal(secretScanSummaryEvent(findings).count, findings.length);
});

test("deploymentPlanSummaryEvents: counts steps, targets and gates", () => {
  const events = deploymentPlanSummaryEvents(planForTwoTargets());
  assert.deepEqual(
    events.map((event) => event.count),
    [12, 2, 7],
  );
});

test("packageManifestSummaryEvents: counts artifacts", () => {
  const manifest: PackageManifest = {
    kind: "package-manifest",
    version: "1.2.3",
    commit: "0123456789abcdef0123456789abcdef01234567",
    artifacts: [
      {
        role: "web-bundle",
        path: "artifacts/web.tar",
        targetIds: ["web-static"],
        byteSize: 10,
        digest: { algorithm: "sha256", hex: "0".repeat(64) },
      },
    ],
    manifestDigest: "0".repeat(64),
  };
  assert.deepEqual(
    packageManifestSummaryEvents(manifest).map((event) => event.count),
    [1],
  );
});
