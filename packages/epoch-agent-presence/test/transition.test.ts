import { test } from "node:test";
import { deepEqual, equal, fail, ok, throws } from "node:assert/strict";
import {
  applyPresenceTransition,
  buildAgentPresenceIdentity,
  buildBindTransition,
  buildCameraFollowTarget,
  buildEntityFollowTarget,
  buildFollowNone,
  buildFollowTransition,
  buildIdleTransition,
  buildMoveTransition,
  buildNoneBinding,
  buildOrientation,
  buildTaskRecordRef,
  buildWorkDescriptor,
  buildWorldPosition,
  projectPresence,
  sha256Hex,
} from "../src/index.js";
import type { AgentPresence, PresenceTransition } from "../src/index.js";

const AGENT = sha256Hex("transition-agent-record");
const TASK = sha256Hex("transition-task-record");
const ENTITY = sha256Hex("transition-entity-record");

function basePresence(): AgentPresence {
  return projectPresence({
    identity: buildAgentPresenceIdentity(AGENT, "agent-alpha"),
    position: buildWorldPosition(0, 0, 0),
    orientation: buildOrientation(0),
    work: buildWorkDescriptor("active", "surveying", buildTaskRecordRef(TASK)),
    binding: buildNoneBinding(),
    follow: buildFollowNone(),
    recordedAt: 1_000,
  });
}

function attachedPresence(mode: "follow" | "bind"): AgentPresence {
  const transition =
    mode === "follow"
      ? buildFollowTransition(buildCameraFollowTarget())
      : buildBindTransition(ENTITY);
  const result = applyPresenceTransition(basePresence(), transition, 1_100);
  if (!result.ok) {
    throw new Error(`transition test setup failed: ${result.rejection.kind}`);
  }
  return result.presence;
}

test("move updates position and orientation and bumps the revision", () => {
  const to = buildWorldPosition(4, 5, 6);
  const orientation = buildOrientation(Math.PI);
  const result = applyPresenceTransition(
    basePresence(),
    buildMoveTransition(to, orientation),
    2_000,
  );
  if (!result.ok) {
    fail(`expected move to apply, got ${result.rejection.kind}`);
  }
  equal(result.presence.revision, 1);
  equal(result.presence.position, to);
  equal(result.presence.orientation, orientation);
  equal(result.presence.recordedAt, 2000);
  equal(result.presence.work.status, "active");
});

test("move keeps the previous orientation when none is provided", () => {
  const presence = basePresence();
  const result = applyPresenceTransition(
    presence,
    buildMoveTransition(buildWorldPosition(1, 1, 1)),
    2_000,
  );
  if (!result.ok) {
    fail(`expected move to apply, got ${result.rejection.kind}`);
  }
  equal(result.presence.orientation, presence.orientation);
});

test("move is rejected while following: the position derives from the follow target", () => {
  const result = applyPresenceTransition(
    attachedPresence("follow"),
    buildMoveTransition(buildWorldPosition(9, 9, 9)),
    2_000,
  );
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "move-rejected", reason: "position-derived-from-follow" });
});

test("move is rejected while bound: the position derives from the bound entity", () => {
  const result = applyPresenceTransition(
    attachedPresence("bind"),
    buildMoveTransition(buildWorldPosition(9, 9, 9)),
    2_000,
  );
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "move-rejected", reason: "position-derived-from-binding" });
});

test("bind attaches the agent to a world-model entity", () => {
  const result = applyPresenceTransition(basePresence(), buildBindTransition(ENTITY), 2_000);
  if (!result.ok) {
    fail(`expected bind to apply, got ${result.rejection.kind}`);
  }
  deepEqual(result.presence.binding, { kind: "binding-entity", entity: ENTITY });
  equal(result.presence.revision, 1);
});

test("bind is rejected when the agent is already bound", () => {
  const result = applyPresenceTransition(
    attachedPresence("bind"),
    buildBindTransition(ENTITY),
    2_000,
  );
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "bind-rejected", reason: "already-bound" });
});

test("bind is rejected while following", () => {
  const result = applyPresenceTransition(
    attachedPresence("follow"),
    buildBindTransition(ENTITY),
    2_000,
  );
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "bind-rejected", reason: "while-following" });
});

test("follow attaches to a camera or an entity target", () => {
  const camera = applyPresenceTransition(
    basePresence(),
    buildFollowTransition(buildCameraFollowTarget()),
    2_000,
  );
  if (!camera.ok) {
    fail(`expected follow to apply, got ${camera.rejection.kind}`);
  }
  deepEqual(camera.presence.follow, { kind: "follow-camera" });
  const entity = applyPresenceTransition(
    basePresence(),
    buildFollowTransition(buildEntityFollowTarget(ENTITY)),
    2_100,
  );
  if (!entity.ok) {
    fail(`expected follow to apply, got ${entity.rejection.kind}`);
  }
  deepEqual(entity.presence.follow, { kind: "follow-entity", entity: ENTITY });
});

test("follow is rejected when the agent is already following", () => {
  const result = applyPresenceTransition(
    attachedPresence("follow"),
    buildFollowTransition(buildEntityFollowTarget(ENTITY)),
    2_000,
  );
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "follow-rejected", reason: "already-following" });
});

test("follow is rejected while bound", () => {
  const result = applyPresenceTransition(
    attachedPresence("bind"),
    buildFollowTransition(buildCameraFollowTarget()),
    2_000,
  );
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "follow-rejected", reason: "while-bound" });
});

test("idle releases the follow state and the entity binding", () => {
  const released = applyPresenceTransition(
    attachedPresence("follow"),
    buildIdleTransition(),
    3_000,
  );
  if (!released.ok) {
    fail(`expected idle to apply, got ${released.rejection.kind}`);
  }
  deepEqual(released.presence.follow, { kind: "follow-none" });
  deepEqual(released.presence.binding, { kind: "binding-none" });
  equal(released.presence.revision, 2);
  equal(released.presence.work.status, "active");
});

test("idle is rejected when there is nothing to release", () => {
  const result = applyPresenceTransition(basePresence(), buildIdleTransition(), 3_000);
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "idle-rejected", reason: "nothing-to-release" });
});

test("applied and rejected transitions never mutate the input record", () => {
  const original = basePresence();
  const snapshot = JSON.parse(JSON.stringify(original)) as AgentPresence;
  const applied = applyPresenceTransition(
    original,
    buildMoveTransition(buildWorldPosition(9, 9, 9)),
    2_000,
  );
  ok(applied.ok);
  const rejected = applyPresenceTransition(original, buildIdleTransition(), 3_000);
  ok(!rejected.ok);
  deepEqual(original, snapshot);
});

test("applyPresenceTransition validates its inputs structurally", () => {
  throws(
    () => applyPresenceTransition({} as unknown as AgentPresence, buildIdleTransition(), 2_000),
    TypeError,
  );
  throws(
    () =>
      applyPresenceTransition(
        basePresence(),
        { kind: "teleport" } as unknown as PresenceTransition,
        2_000,
      ),
    TypeError,
  );
  throws(() => applyPresenceTransition(basePresence(), buildIdleTransition(), -5), TypeError);
});
