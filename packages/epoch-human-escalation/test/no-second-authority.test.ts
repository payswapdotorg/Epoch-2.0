import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EscalationSession,
  InMemoryEscalationAdapter,
  init,
  request,
  resolve,
  serializeState,
} from "../src/index.js";
import {
  baseQuestion,
  fullResponse,
  openPolicy,
  recordingWorld,
} from "./helpers.js";

test("expert data never mutates the world revision (no writes recorded)", async () => {
  const { world, writes } = recordingWorld();
  const adapter = new InMemoryEscalationAdapter({
    expertise: ["ifc", "construction"],
  });
  const session = EscalationSession.create({
    policy: openPolicy(),
    adapter,
    world,
  });
  await session.ask(baseQuestion());
  await session.collectResponses();
  assert.equal(writes.length, 0);
  assert.equal(world.revisionDigest, "c".repeat(64));
  assert.deepEqual(
    session.history().map((entry) => entry.status),
    ["resolved"],
  );
});

test("machine state carries no world-revision or write surface", () => {
  const result = request(init(openPolicy()), baseQuestion());
  assert.deepEqual(Object.keys(result.state).sort(), [
    "parentDigest",
    "policy",
    "policyDigest",
    "requests",
    "serial",
    "step",
  ]);
  assert.deepEqual(
    Object.keys(result.state.requests[result.request.id]).sort(),
    ["rejectionCount", "request", "status"],
  );
  assert.equal("world" in result.state, false);
  assert.equal("revision" in result.state, false);
});

test("learn notes explicitly declare worldMutation: none", async () => {
  const adapter = new InMemoryEscalationAdapter({
    expertise: ["ifc", "construction"],
  });
  const session = EscalationSession.create({
    policy: openPolicy(),
    adapter,
    grants: { attachLearnNotes: true },
  });
  await session.ask(baseQuestion());
  await session.collectResponses();
  const notes = session.learnNotes([{ phase: "learn" }]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.worldMutation, "none");
});

test("the expert answer appears exactly once, only as provenance-bearing response data", () => {
  const answerText = "Rule 4.2 applies; see the referenced evidence digest.";
  const result = request(init(openPolicy()), baseQuestion());
  const resolved = resolve(result.state, fullResponse(result.request.id));
  const serialized = serializeState(resolved.state);
  assert.equal(serialized.split(answerText).length - 1, 1);
  assert.equal(
    resolved.state.requests[result.request.id].acceptedResponse?.answer,
    answerText,
  );
});

test("the escalation adapter exposes no storage or world-write surface", () => {
  const adapter = new InMemoryEscalationAdapter();
  const prototype = Object.getPrototypeOf(adapter) as Record<string, unknown>;
  const methods = Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor")
    .sort();
  assert.deepEqual(methods, [
    "awaitResponse",
    "fulfill",
    "submit",
    "submittedRequests",
  ]);
  assert.equal("put" in adapter, false);
  assert.equal("get" in adapter, false);
});
