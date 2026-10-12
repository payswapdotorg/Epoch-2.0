import { test } from "node:test";
import { deepEqual, equal, ok, throws } from "node:assert/strict";
import {
  buildAgentPresenceIdentity,
  buildCameraFollowTarget,
  buildEntityBinding,
  buildFollowNone,
  buildNoneBinding,
  buildOrientation,
  buildTaskRecordRef,
  buildWorkDescriptor,
  buildWorldPosition,
  buildPresenceView,
  buildPresenceViews,
  projectPresence,
  sha256Hex,
} from "../src/index.js";
import type { AgentPresence, FollowTarget, WorkStatus } from "../src/index.js";

const AGENT = sha256Hex("view-agent-record");
const ENTITY = sha256Hex("view-entity-record");
const TASK = sha256Hex("view-task-record");

function presenceWith(
  key: string,
  agent: string,
  opts: { status?: WorkStatus; follow?: FollowTarget; bound?: boolean } = {},
): AgentPresence {
  return projectPresence({
    identity: buildAgentPresenceIdentity(agent, key),
    position: buildWorldPosition(1, 2, 3),
    orientation: buildOrientation(0),
    work: buildWorkDescriptor(opts.status ?? "active", "work", buildTaskRecordRef(TASK)),
    binding: opts.bound === true ? buildEntityBinding(ENTITY) : buildNoneBinding(),
    follow: opts.follow ?? buildFollowNone(),
    recordedAt: 1_000,
  });
}

test("buildPresenceView maps a detached working agent", () => {
  const view = buildPresenceView(presenceWith("agent-alpha", AGENT));
  equal(view.kind, "presence-view");
  equal(view.agentRecord, AGENT);
  equal(view.presenceKey, "agent-alpha");
  equal(view.revision, 0);
  deepEqual(view.position, { kind: "world-position", x: 1, y: 2, z: 3 });
  deepEqual(view.orientation, { kind: "orientation", yawRadians: 0 });
  equal(view.badge, "working");
  equal(view.workStatus, "active");
  equal(view.positionPolicy, "explicit");
  deepEqual(view.follow, { kind: "follow-none" });
  deepEqual(view.binding, { kind: "binding-none" });
  equal(view.recordedAt, 1000);
});

test("a following agent is badged following with a derived position policy", () => {
  const view = buildPresenceView(
    presenceWith("agent-alpha", AGENT, { follow: buildCameraFollowTarget() }),
  );
  equal(view.badge, "following");
  equal(view.positionPolicy, "derived-from-follow");
});

test("a bound agent is badged bound even while working", () => {
  const view = buildPresenceView(presenceWith("agent-alpha", AGENT, { bound: true }));
  equal(view.badge, "bound");
  equal(view.positionPolicy, "derived-from-binding");
});

test("a blocked detached agent is badged blocked", () => {
  const view = buildPresenceView(presenceWith("agent-alpha", AGENT, { status: "blocked" }));
  equal(view.badge, "blocked");
  equal(view.workStatus, "blocked");
});

test("an idle detached agent is badged idle", () => {
  const view = buildPresenceView(presenceWith("agent-alpha", AGENT, { status: "idle" }));
  equal(view.badge, "idle");
});

test("buildPresenceViews sorts fleet views by presence key", () => {
  const views = buildPresenceViews([
    presenceWith("agent-gamma", sha256Hex("view-c")),
    presenceWith("agent-alpha", sha256Hex("view-a")),
    presenceWith("agent-beta", sha256Hex("view-b")),
  ]);
  deepEqual(
    views.map((view) => view.presenceKey),
    ["agent-alpha", "agent-beta", "agent-gamma"],
  );
  ok(views.every((view) => view.kind === "presence-view"));
});

test("buildPresenceView validates its input", () => {
  throws(() => buildPresenceView({} as unknown as AgentPresence), TypeError);
  throws(() => buildPresenceViews([{} as unknown as AgentPresence]), TypeError);
});
