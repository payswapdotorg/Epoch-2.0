import { test } from "node:test";
import assert from "node:assert/strict";

import {
  type CandidateExport,
  type Demonstration,
  type StoredEnvelope,
  type WorldStorePort,
  PersistenceBindingError,
  bindWorldStore,
  buildCandidateExport,
  buildDemonstration,
  candidateDigest,
  defineEpisode,
  demonstrationDigest,
  episodeDigest,
  makeCapturePolicy,
  makeEvent,
} from "../src/index.js";

const session = { sessionId: "s-1", environmentId: "env-1" };

class InMemoryWorldStore implements WorldStorePort {
  readonly entries = new Map<string, StoredEnvelope>();
  put(envelope: StoredEnvelope): void {
    this.entries.set(envelope.digest, envelope);
  }
  get(digest: string): StoredEnvelope | null {
    return this.entries.get(digest) ?? null;
  }
}

function episode() {
  return defineEpisode({
    episodeId: "ep-1",
    session,
    records: [
      makeEvent({
        session,
        sequence: 1,
        kind: "command.invoked",
        initiator: "human",
        payload: { n: 1 },
      }),
      makeEvent({
        session,
        sequence: 2,
        kind: "tool.applied",
        initiator: "agent",
        payload: { n: 2 },
      }),
    ],
    userIntent: "place a wall",
    sessionLength: 2,
  });
}

function demonstration(): Demonstration {
  return buildDemonstration({
    demonstrationId: "demo-1",
    title: "Wall placement",
    episodes: [episode()],
    resultCorrelations: [
      {
        role: "result",
        kind: "world-revision",
        digest: "sha256:simulated-revision",
      },
    ],
    boundary: {
      covers: ["the recorded command sequence"],
      doesNotCover: ["anything outside the session"],
    },
  });
}

function candidate(demo: Demonstration): CandidateExport {
  return buildCandidateExport({
    exportId: "cand-1",
    demonstration: demo,
    policies: [
      makeCapturePolicy({
        policyId: "pol-1",
        subject: "user-1",
        environmentId: "env-1",
        scope: {
          includedEventKinds: ["*"],
          excludedEventKinds: [],
          includedInitiators: ["human", "agent", "application"],
        },
        consent: { consentId: "c-1", subject: "user-1", state: "granted" },
        retention: { allowed: true },
        reuse: { allowed: true, projects: ["*"] },
      }),
    ],
    originProject: "proj-A",
    targetProject: "proj-A",
    preparedBy: "w029-tests",
  });
}

test("episodes round-trip by digest through a WorldStore port", async () => {
  const store = new InMemoryWorldStore();
  const binding = bindWorldStore(store);
  const original = episode();
  const digest = await binding.saveEpisode(original);
  assert.equal(digest, episodeDigest(original));
  const restored = await binding.restoreEpisode(digest);
  assert.deepEqual(restored, original);
  assert.equal(episodeDigest(restored), digest);
  assert.equal(Object.isFrozen(restored), true);
});

test("demonstrations and candidate exports round-trip by digest", async () => {
  const store = new InMemoryWorldStore();
  const binding = bindWorldStore(store);
  const demo = demonstration();
  const demoDigest = await binding.saveDemonstration(demo);
  const restoredDemo = await binding.restoreDemonstration(demoDigest);
  assert.deepEqual(restoredDemo, demo);
  assert.equal(demonstrationDigest(restoredDemo), demoDigest);
  const exportBundle = candidate(demo);
  const exportDigest = await binding.saveCandidateExport(exportBundle);
  const restoredExport = await binding.restoreCandidateExport(exportDigest);
  assert.deepEqual(restoredExport, exportBundle);
  assert.equal(candidateDigest(restoredExport), exportDigest);
  assert.equal(restoredExport.status, "unverified-candidate");
});

test("restoring verifies digests and rejects mismatches, wrong kinds and unknown keys", async () => {
  const store = new InMemoryWorldStore();
  const binding = bindWorldStore(store);
  const digest = await binding.saveEpisode(episode());
  await assert.rejects(
    () => binding.restoreDemonstration(digest),
    (error: unknown) =>
      error instanceof PersistenceBindingError &&
      /does not match requested kind/.test(error.message),
  );
  await assert.rejects(
    () => binding.restoreEpisode(`sha256:${"0".repeat(64)}`),
    (error: unknown) =>
      error instanceof PersistenceBindingError &&
      /not found/.test(error.message),
  );
  await assert.rejects(
    () => binding.restoreEpisode(""),
    PersistenceBindingError,
  );
  let stored: StoredEnvelope | undefined;
  const tamperingStore: WorldStorePort = {
    put: (envelope) => {
      const base = JSON.parse(JSON.stringify(envelope)) as StoredEnvelope;
      const tamperedPayload = {
        ...(base.payload as Record<string, unknown>),
        episodeId: "tampered",
      };
      stored = {
        ...base,
        payload: tamperedPayload as unknown as StoredEnvelope["payload"],
      };
    },
    get: () => stored ?? null,
  };
  const tamperingBinding = bindWorldStore(tamperingStore);
  const original = episode();
  const savedDigest = await tamperingBinding.saveEpisode(original);
  await assert.rejects(
    () => tamperingBinding.restoreEpisode(savedDigest),
    (error: unknown) =>
      error instanceof PersistenceBindingError &&
      /digest mismatch/.test(error.message),
  );
});

test("the binding tolerates asynchronous store implementations", async () => {
  const entries = new Map<string, StoredEnvelope>();
  const asyncStore: WorldStorePort = {
    put: async (envelope) => {
      await Promise.resolve();
      entries.set(envelope.digest, envelope);
    },
    get: async (digest) => {
      await Promise.resolve();
      return entries.get(digest) ?? null;
    },
  };
  const binding = bindWorldStore(asyncStore);
  const original = episode();
  const digest = await binding.saveEpisode(original);
  const restored = await binding.restoreEpisode(digest);
  assert.deepEqual(restored, original);
});

test("restored objects re-attach with their original digests", async () => {
  const store = new InMemoryWorldStore();
  const binding = bindWorldStore(store);
  const original = episode();
  const first = await binding.saveEpisode(original);
  const second = await binding.saveEpisode(original);
  assert.equal(first, second);
  const restored = await binding.restoreEpisode(first);
  assert.equal(episodeDigest(restored), first);
  await binding.saveEpisode(restored);
  assert.equal(store.entries.size, 1);
});
