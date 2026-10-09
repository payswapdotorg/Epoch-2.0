/**
 * W002 验收测试（强制）：摘要稳定性——open() 的相同输入产生相同 digest。
 *
 * 依据 spec/work-orders/W002「Acceptance」与 world-model「Determinism」：
 * 用 N>=5 次独立 open（每次新建引擎实例）断言 digest 全等；
 * 并断言不同变体产生不同 digest（投影世界确实改变）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createConstructionFixtureEngine } from "../src/index.ts";
import { buildVariantRevision } from "../src/index.ts";
import type { ReconstructionInput, ReconstructionContext } from "@zcode/epoch-reconstruction-contract";

const CONTEXT: ReconstructionContext = { workspaceKey: "ws-test" };

function fixtureInput(variant?: string): ReconstructionInput {
  return {
    kind: "engine-native",
    engineId: "epoch.construction-fixture",
    payload: variant === undefined ? {} : { variant },
  };
}

test("repeated open() of baseline yields identical digest across N>=5 fresh engines", async () => {
  const digests: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const engine = createConstructionFixtureEngine();
    const session = await engine.open(fixtureInput("baseline"), CONTEXT);
    const revision = await session.snapshot();
    digests.push(revision.digest);
    await session.close();
  }
  const first = digests[0]!;
  for (const digest of digests) assert.equal(digest, first);
  assert.equal(new Set(digests).size, 1, "all digests must be identical");
});

test("repeated open() of alternate yields identical digest across N>=5 fresh engines", async () => {
  const digests: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const engine = createConstructionFixtureEngine();
    const session = await engine.open(fixtureInput("alternate-pitched-roof"), CONTEXT);
    const revision = await session.snapshot();
    digests.push(revision.digest);
    await session.close();
  }
  assert.equal(new Set(digests).size, 1, "all digests must be identical");
});

test("default open() (no variant) equals baseline digest", async () => {
  const engineA = createConstructionFixtureEngine();
  const defaultSession = await engineA.open(fixtureInput(), CONTEXT);
  const defaultRevision = await defaultSession.snapshot();
  await defaultSession.close();

  const engineB = createConstructionFixtureEngine();
  const baselineSession = await engineB.open(fixtureInput("baseline"), CONTEXT);
  const baselineRevision = await baselineSession.snapshot();
  await baselineSession.close();

  assert.equal(defaultRevision.digest, baselineRevision.digest);
});

test("different variants produce different digests (projected world changes)", () => {
  const baseline = buildVariantRevision("baseline");
  const alternate = buildVariantRevision("alternate-pitched-roof");
  assert.notEqual(baseline.digest, alternate.digest);
  assert.notEqual(baseline.revisionId, alternate.revisionId);
  assert.equal(baseline.worldId, alternate.worldId, "worldId stable across variants");
});

test("digest is 64-char lowercase hex", () => {
  const revision = buildVariantRevision("baseline");
  assert.match(revision.digest, /^[0-9a-f]{64}$/);
});

test("apply(select-variant) switches the projected world and changes the digest", async () => {
  const engine = createConstructionFixtureEngine();
  const session = await engine.open(fixtureInput("baseline"), CONTEXT);
  const before = await session.snapshot();
  const after = await session.apply({ operationId: "op-1", kind: "select-variant", payload: { variant: "alternate-pitched-roof" } });
  assert.notEqual(before.digest, after.digest);
  const snapshot = await session.snapshot();
  assert.equal(snapshot.digest, after.digest);
  await session.close();
});

test("snapshot() is stable across repeated calls within a session", async () => {
  const engine = createConstructionFixtureEngine();
  const session = await engine.open(fixtureInput("baseline"), CONTEXT);
  const a = await session.snapshot();
  const b = await session.snapshot();
  const c = await session.snapshot();
  assert.equal(a.digest, b.digest);
  assert.equal(a.digest, c.digest);
  assert.equal(a.revisionId, b.revisionId);
  await session.close();
});
