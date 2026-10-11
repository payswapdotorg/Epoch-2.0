import { test } from "node:test";
import assert from "node:assert/strict";
import {
  digestCanonical,
  storeHealthReport,
  verifyStoreIntegrity,
  type WorldStorePort,
} from "../src/contract.js";

interface RecordSeed {
  readonly id: string;
  readonly content: unknown;
  readonly digest?: string;
}

interface WorldSeed {
  readonly id: string;
  readonly content: unknown;
  readonly digest?: string;
  readonly records: readonly RecordSeed[];
}

interface StoreOptions {
  readonly worldOrder?: readonly string[];
}

function buildStore(
  seeds: readonly WorldSeed[],
  options?: StoreOptions,
): { port: WorldStorePort; calls: readonly string[] } {
  const worlds = new Map<string, WorldSeed>(seeds.map((seed) => [seed.id, seed]));
  const calls: string[] = [];
  const port: WorldStorePort = {
    listWorlds() {
      calls.push("listWorlds");
      if (options?.worldOrder !== undefined) {
        return options.worldOrder;
      }
      return [...worlds.keys()];
    },
    listRecords(worldId) {
      calls.push("listRecords");
      return worlds.get(worldId)?.records.map((record) => record.id) ?? [];
    },
    readWorld(worldId) {
      calls.push("readWorld");
      return worlds.get(worldId)?.content ?? null;
    },
    readRecord(worldId, recordId) {
      calls.push("readRecord");
      return (
        worlds.get(worldId)?.records.find((record) => record.id === recordId)?.content ??
        null
      );
    },
    declaredDigest(worldId, recordId) {
      calls.push("declaredDigest");
      const world = worlds.get(worldId);
      if (recordId === null) {
        return world?.digest ?? null;
      }
      return (
        world?.records.find((record) => record.id === recordId)?.digest ?? null
      );
    },
  };
  return { port, calls };
}

function healthyFixture(): { readonly w1: WorldSeed; readonly w2: WorldSeed } {
  const w1Content = { id: "w1", title: "world one" };
  const r1Content = { id: "r1", worldId: "w1", parentId: "r2" };
  const r2Content = { id: "r2", worldId: "w1" };
  const w2Content = { id: "w2" };
  return {
    w1: {
      id: "w1",
      content: w1Content,
      digest: digestCanonical(w1Content),
      records: [
        { id: "r1", content: r1Content, digest: digestCanonical(r1Content) },
        { id: "r2", content: r2Content, digest: digestCanonical(r2Content) },
      ],
    },
    w2: { id: "w2", content: w2Content, digest: digestCanonical(w2Content), records: [] },
  };
}

function healthySeeds(): readonly WorldSeed[] {
  const fixture = healthyFixture();
  return [fixture.w1, fixture.w2];
}

test("healthy store: zero findings, healthy status", () => {
  const { port } = buildStore(healthySeeds());
  const report = verifyStoreIntegrity(port);
  assert.deepEqual(report.findings, []);
  assert.equal(report.worldsChecked, 2);
  assert.equal(report.recordsChecked, 2);
  assert.equal(report.digestChecks, 4);
  const health = storeHealthReport(report);
  assert.equal(health.status, "healthy");
  assert.equal(health.healthy, true);
  assert.match(health.summary, /^store health: healthy \(0 errors, 0 warnings/);
});

test("tampered world digests are detected by re-computation", () => {
  const { w1, w2 } = healthyFixture();
  const tampered: WorldSeed = { ...w1, digest: "f".repeat(64) };
  const report = verifyStoreIntegrity(buildStore([tampered, w2]).port);
  const finding = report.findings.find((item) => item.code === "world-digest-mismatch");
  assert.notEqual(finding, undefined);
  assert.equal(finding?.severity, "error");
  assert.equal(finding?.declaredDigest, "f".repeat(64));
  assert.equal(finding?.computedDigest, digestCanonical(w1.content));
  assert.equal(storeHealthReport(report).status, "corrupt");
});

test("tampered record digests are detected by re-computation", () => {
  const { w1, w2 } = healthyFixture();
  const records = w1.records.map((record) =>
    record.id === "r2" ? { ...record, digest: "e".repeat(64) } : record,
  );
  const report = verifyStoreIntegrity(buildStore([{ ...w1, records }, w2]).port);
  const finding = report.findings.find((item) => item.code === "record-digest-mismatch");
  assert.notEqual(finding, undefined);
  assert.equal(finding?.recordId, "r2");
  assert.equal(storeHealthReport(report).status, "corrupt");
});

test("malformed declared digests are rejected", () => {
  const { w2 } = healthyFixture();
  const malformed: WorldSeed = { ...w2, digest: "nothex" };
  const report = verifyStoreIntegrity(buildStore([malformed]).port);
  assert.equal(
    report.findings.some((item) => item.code === "world-digest-malformed"),
    true,
  );
  assert.equal(report.digestChecks, 0);
});

test("entries without declared digests skip digest verification", () => {
  const { w1, w2 } = healthyFixture();
  const bare = (world: WorldSeed): WorldSeed => ({
    ...world,
    digest: undefined,
    records: world.records.map((record) => ({ ...record, digest: undefined })),
  });
  const report = verifyStoreIntegrity(buildStore([bare(w1), bare(w2)]).port);
  assert.deepEqual(report.findings, []);
  assert.equal(report.digestChecks, 0);
});

test("world key mismatch: content id differs from the storage key", () => {
  const world: WorldSeed = { id: "w1", content: { id: "w-one", title: "x" }, records: [] };
  const report = verifyStoreIntegrity(buildStore([world]).port);
  assert.equal(
    report.findings.some((item) => item.code === "world-key-mismatch"),
    true,
  );
});

test("record key mismatch: content id differs from the storage key", () => {
  const world: WorldSeed = {
    id: "w1",
    content: { id: "w1" },
    records: [{ id: "r1", content: { id: "r-other" } }],
  };
  const report = verifyStoreIntegrity(buildStore([world]).port);
  assert.equal(
    report.findings.some((item) => item.code === "record-key-mismatch"),
    true,
  );
});

test("records referencing a missing parent record are orphans", () => {
  const world: WorldSeed = {
    id: "w1",
    content: { id: "w1" },
    records: [{ id: "r1", content: { id: "r1", parentId: "ghost" } }],
  };
  const report = verifyStoreIntegrity(buildStore([world]).port);
  const finding = report.findings.find((item) => item.code === "record-orphan-parent");
  assert.notEqual(finding, undefined);
  assert.equal(finding?.severity, "error");
});

test("records referencing an unstored world are orphans", () => {
  const world: WorldSeed = {
    id: "w1",
    content: { id: "w1" },
    records: [{ id: "r1", content: { id: "r1", worldId: "ghost" } }],
  };
  const report = verifyStoreIntegrity(buildStore([world]).port);
  assert.equal(
    report.findings.some((item) => item.code === "record-orphan-world"),
    true,
  );
});

test("records filed under the wrong known world are mismatched", () => {
  const { w1, w2 } = healthyFixture();
  const misplaced: WorldSeed = {
    ...w1,
    records: [{ id: "r1", content: { id: "r1", worldId: "w2" } }],
  };
  const report = verifyStoreIntegrity(buildStore([misplaced, w2]).port);
  assert.equal(
    report.findings.some((item) => item.code === "record-world-mismatch"),
    true,
  );
});

test("listed entries that read as null are reported", () => {
  const world: WorldSeed = {
    id: "w1",
    content: null,
    records: [{ id: "r1", content: null }],
  };
  const report = verifyStoreIntegrity(buildStore([world]).port);
  assert.equal(
    report.findings.some((item) => item.code === "world-unreadable"),
    true,
  );
  assert.equal(
    report.findings.some((item) => item.code === "record-unreadable"),
    true,
  );
  assert.equal(report.recordsChecked, 1);
});

test("non-canonicalizable content is reported", () => {
  const world: WorldSeed = {
    id: "w1",
    content: { id: "w1", callback: () => "x" },
    records: [],
  };
  const report = verifyStoreIntegrity(buildStore([world]).port);
  assert.equal(
    report.findings.some((item) => item.code === "world-content-noncanonical"),
    true,
  );
  assert.equal(report.digestChecks, 0);
});

test("duplicate listings are reported as warnings", () => {
  const { w1 } = healthyFixture();
  const { port } = buildStore([w1]);
  const doubled: WorldStorePort = {
    listWorlds: () => ["w1", "w1"],
    listRecords: () => ["r1", "r1", "r2"],
    readWorld: port.readWorld,
    readRecord: port.readRecord,
    declaredDigest: port.declaredDigest,
  };
  const report = verifyStoreIntegrity(doubled);
  assert.equal(
    report.findings.some((item) => item.code === "world-listing-duplicate"),
    true,
  );
  assert.equal(
    report.findings.some((item) => item.code === "record-listing-duplicate"),
    true,
  );
  const health = storeHealthReport(report);
  assert.equal(health.status, "degraded");
  assert.equal(health.healthy, false);
});

test("report digest is deterministic and listing-order independent", () => {
  const fixture = healthyFixture();
  const first = verifyStoreIntegrity(buildStore([fixture.w1, fixture.w2]).port);
  const second = verifyStoreIntegrity(
    buildStore([fixture.w2, fixture.w1], { worldOrder: ["w2", "w1"] }).port,
  );
  assert.equal(first.reportDigest, second.reportDigest);
});

test("storeHealthReport: counts errors, warnings and mismatch classes", () => {
  const { w1 } = healthyFixture();
  const tampered: WorldSeed = { ...w1, digest: "f".repeat(64) };
  const { port } = buildStore([tampered], { worldOrder: ["w1", "w1"] });
  const report = verifyStoreIntegrity(port);
  const health = storeHealthReport(report);
  assert.equal(health.status, "corrupt");
  assert.equal(health.errorCount, 1);
  assert.equal(health.warningCount, 1);
  assert.equal(health.digestMismatches, 1);
  assert.equal(health.worlds, 1);
});

test("the sweep only ever calls the five read operations", () => {
  const { port, calls } = buildStore(healthySeeds());
  verifyStoreIntegrity(port);
  const readCalls = new Set([
    "listWorlds",
    "listRecords",
    "readWorld",
    "readRecord",
    "declaredDigest",
  ]);
  for (const call of calls) {
    assert.equal(readCalls.has(call), true, `unexpected store call ${call}`);
  }
});
