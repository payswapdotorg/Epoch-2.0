import { test } from "node:test";
import { deepEqual, equal, ok, throws } from "node:assert/strict";
import {
  buildActivityRecordRef,
  buildAgentPresenceIdentity,
  buildCameraFollowTarget,
  buildEntityBinding,
  buildEntityFollowTarget,
  buildFollowNone,
  buildNoneBinding,
  buildOrientation,
  buildTaskRecordRef,
  buildWorkDescriptor,
  buildWorldPosition,
  sha256Hex,
} from "../src/index.js";
import type { SemanticRecordRef, WorkStatus } from "../src/index.js";

const AGENT = sha256Hex("values-agent-record");
const ENTITY = sha256Hex("values-entity-record");
const TASK = sha256Hex("values-task-record");
const ACTIVITY = sha256Hex("values-activity-record");

test("buildWorldPosition validates finite coordinates", () => {
  deepEqual(buildWorldPosition(1, 2, 3), { kind: "world-position", x: 1, y: 2, z: 3 });
  throws(() => buildWorldPosition(Number.NaN, 0, 0), TypeError);
  throws(() => buildWorldPosition(0, Number.POSITIVE_INFINITY, 0), TypeError);
});

test("buildOrientation normalizes yaw into [0, 2*pi)", () => {
  equal(buildOrientation(0).yawRadians, 0);
  equal(buildOrientation(2 * Math.PI).yawRadians, 0);
  ok(Math.abs(buildOrientation(-Math.PI / 2).yawRadians - (3 * Math.PI) / 2) < 1e-12);
  ok(Math.abs(buildOrientation(Math.PI * 2.5).yawRadians - Math.PI / 2) < 1e-12);
  throws(() => buildOrientation(Number.NaN), TypeError);
});

test("buildAgentPresenceIdentity validates the agent digest and the projection key", () => {
  const identity = buildAgentPresenceIdentity(AGENT, "agent-alpha");
  deepEqual(identity, {
    kind: "agent-presence-identity",
    agentRecord: AGENT,
    presenceKey: "agent-alpha",
  });
  throws(() => buildAgentPresenceIdentity("not-a-digest", "agent-alpha"), TypeError);
  throws(() => buildAgentPresenceIdentity(AGENT, "Not_Kebab"), TypeError);
});

test("semantic record refs validate digests and tag their record kind", () => {
  deepEqual(buildTaskRecordRef(TASK), { kind: "task-record", digest: TASK });
  deepEqual(buildActivityRecordRef(ACTIVITY), { kind: "activity-record", digest: ACTIVITY });
  throws(() => buildTaskRecordRef("xyz"), TypeError);
  throws(() => buildActivityRecordRef(123 as unknown as string), TypeError);
});

test("buildWorkDescriptor validates status, label, and source", () => {
  const source = buildActivityRecordRef(ACTIVITY);
  const work = buildWorkDescriptor("active", "inspecting fixture", source);
  equal(work.kind, "work-descriptor");
  equal(work.status, "active");
  equal(work.label, "inspecting fixture");
  equal(work.source, source);
  throws(() => buildWorkDescriptor("busy" as unknown as WorkStatus, "x", source), TypeError);
  throws(() => buildWorkDescriptor("idle", "", source), TypeError);
  throws(
    () => buildWorkDescriptor("idle", "x", { kind: "task-record" } as unknown as SemanticRecordRef),
    TypeError,
  );
});

test("binding and follow builders validate entity digests", () => {
  deepEqual(buildNoneBinding(), { kind: "binding-none" });
  deepEqual(buildEntityBinding(ENTITY), { kind: "binding-entity", entity: ENTITY });
  throws(() => buildEntityBinding("deadbeef"), TypeError);
  deepEqual(buildFollowNone(), { kind: "follow-none" });
  deepEqual(buildCameraFollowTarget(), { kind: "follow-camera" });
  deepEqual(buildEntityFollowTarget(ENTITY), { kind: "follow-entity", entity: ENTITY });
  throws(() => buildEntityFollowTarget(""), TypeError);
});
