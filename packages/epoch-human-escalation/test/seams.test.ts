import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EscalationError,
  EscalationSession,
  attachableNotesFor,
  init,
  isLearnPhaseEvent,
  learnPhaseNotes,
  request,
  resolve,
  routeExpertise,
  type CapabilitySourcePort,
} from "../src/index.js";
import {
  baseQuestion,
  deepFreeze,
  fullResponse,
  openPolicy,
} from "./helpers.js";

test("learnPhaseNotes derives structured provenance-bearing notes from resolved requests", () => {
  const asked = request(init(openPolicy()), baseQuestion());
  const state = resolve(asked.state, fullResponse(asked.request.id)).state;
  const notes = learnPhaseNotes(state);
  assert.equal(notes.length, 1);
  const note = notes[0];
  assert.equal(note?.kind, "epoch.escalation.note/v1");
  assert.equal(note?.requestId, asked.request.id);
  assert.equal(note?.questionKind, "factual");
  assert.equal(
    note?.answer,
    "Rule 4.2 applies; see the referenced evidence digest.",
  );
  assert.equal(note?.provenance.providerId, "test-provider");
  assert.equal(note?.provenance.expertKey, "expert-7");
  assert.equal(note?.provenance.channel, "direct");
  assert.equal(note?.provenance.answeredAt, "2026-07-01T10:00:00.000Z");
  assert.equal(note?.worldMutation, "none");
  assert.equal(note?.requestDigest.length, 64);
});

test("isLearnPhaseEvent recognizes learn-phase events structurally", () => {
  assert.equal(isLearnPhaseEvent({ phase: "learn" }), true);
  assert.equal(isLearnPhaseEvent({ phase: "Learn" }), true);
  assert.equal(isLearnPhaseEvent({ phase: "learn-phase" }), true);
  assert.equal(isLearnPhaseEvent({ phase: "learning" }), true);
  assert.equal(isLearnPhaseEvent({ phase: "execute" }), false);
});

test("attachableNotesFor returns notes only when a Learn-phase event is present", () => {
  const asked = request(init(openPolicy()), baseQuestion());
  const state = resolve(asked.state, fullResponse(asked.request.id)).state;
  assert.equal(attachableNotesFor([{ phase: "execute" }], state).length, 0);
  assert.equal(attachableNotesFor([{ phase: "learn" }], state).length, 1);
});

test("note derivation never mutates the host lifecycle events (frozen input)", () => {
  const asked = request(init(openPolicy()), baseQuestion());
  const state = resolve(asked.state, fullResponse(asked.request.id)).state;
  const events = deepFreeze([
    { phase: "learn", revisionDigest: "d".repeat(64) },
  ]);
  const before = JSON.stringify(events);
  attachableNotesFor(events, state);
  assert.equal(JSON.stringify(events), before);
});

test("session.learnNotes requires the attachLearnNotes grant (default-deny)", () => {
  const denied = EscalationSession.create({ policy: openPolicy() });
  assert.throws(
    () => denied.learnNotes([{ phase: "learn" }]),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "grant-required",
  );
  const granted = EscalationSession.create({
    policy: openPolicy(),
    grants: { attachLearnNotes: true },
  });
  assert.deepEqual(granted.learnNotes([{ phase: "learn" }]), []);
});

test("expertise routing consumes discovered capability tags without mutating them", () => {
  const asked = request(
    init(openPolicy()),
    baseQuestion({ requestedExpertise: ["ifc", "construction"] }),
  );
  const capabilities = deepFreeze([
    { tags: ["ifc", "bim"] },
    { tags: ["gltf"] },
  ]);
  const before = JSON.stringify(capabilities);
  const matches = routeExpertise(asked.state, capabilities);
  assert.deepEqual(
    matches.map((match) => match.tag),
    ["ifc"],
  );
  assert.equal(matches[0]?.matchingCapabilities.length, 1);
  assert.equal(JSON.stringify(capabilities), before);
});

test("session.expertiseRouting requires the consumeCapabilityTags grant (default-deny)", async () => {
  const discovered = deepFreeze([{ tags: ["ifc"] }]);
  const source: CapabilitySourcePort = { discovered: () => discovered };
  const denied = EscalationSession.create({
    policy: openPolicy(),
    capabilitySource: source,
  });
  assert.throws(
    () => denied.expertiseRouting(),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "grant-required",
  );
  const granted = EscalationSession.create({
    policy: openPolicy(),
    capabilitySource: source,
    grants: { consumeCapabilityTags: true },
  });
  await granted.ask(baseQuestion({ requestedExpertise: ["ifc"] }));
  const matches = granted.expertiseRouting();
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.tag, "ifc");
});

test("routeExpertise considers only open requests", () => {
  let state = request(
    init(openPolicy()),
    baseQuestion({ requestedExpertise: ["ifc"] }),
  ).state;
  const capabilities = [{ tags: ["ifc"] }];
  assert.equal(routeExpertise(state, capabilities).length, 1);
  state = resolve(state, fullResponse("req-00000001")).state;
  assert.equal(routeExpertise(state, capabilities).length, 0);
});
