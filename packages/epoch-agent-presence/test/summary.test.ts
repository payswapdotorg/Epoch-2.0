import { test } from "node:test";
import { deepEqual, equal, fail, throws } from "node:assert/strict";
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
  projectPresence,
  sha256Hex,
  summarizePresence,
} from "../src/index.js";
import type { AgentPresence, FollowTarget, WorkStatus } from "../src/index.js";

function presenceWith(
  key: string,
  agent: string,
  opts: { status?: WorkStatus; follow?: FollowTarget; bound?: boolean } = {},
): AgentPresence {
  return projectPresence({
    identity: buildAgentPresenceIdentity(agent, key),
    position: buildWorldPosition(0, 0, 0),
    orientation: buildOrientation(0),
    work: buildWorkDescriptor(
      opts.status ?? "active",
      "work",
      buildTaskRecordRef(sha256Hex(`task-${key}`)),
    ),
    binding:
      opts.bound === true ? buildEntityBinding(sha256Hex(`entity-${key}`)) : buildNoneBinding(),
    follow: opts.follow ?? buildFollowNone(),
    recordedAt: 1_000,
  });
}

test("summarizePresence counts badges, work statuses, follow states, and bindings", () => {
  const fleet = [
    presenceWith("agent-alpha", sha256Hex("summary-a"), { follow: buildCameraFollowTarget() }),
    presenceWith("agent-beta", sha256Hex("summary-b"), { bound: true }),
    presenceWith("agent-gamma", sha256Hex("summary-c"), { status: "blocked" }),
    presenceWith("agent-delta", sha256Hex("summary-d")),
  ];
  const result = summarizePresence(fleet, 5_000);
  if (!result.ok) {
    fail(`expected a summary, got ${result.rejection.kind}`);
  }
  equal(result.summary.kind, "presence-fleet-summary");
  equal(result.summary.agentCount, 4);
  deepEqual(result.summary.byBadge, { following: 1, bound: 1, working: 1, blocked: 1, idle: 0 });
  deepEqual(result.summary.byWorkStatus, { idle: 0, active: 3, blocked: 1 });
  deepEqual(result.summary.byFollow, { none: 3, camera: 1, entity: 0 });
  deepEqual(result.summary.byBinding, { none: 3, entity: 1 });
  equal(result.summary.computedAt, 5000);
});

test("summarizePresence sorts entries by presence key", () => {
  const fleet = [
    presenceWith("agent-gamma", sha256Hex("summary-c")),
    presenceWith("agent-alpha", sha256Hex("summary-a")),
    presenceWith("agent-beta", sha256Hex("summary-b")),
  ];
  const result = summarizePresence(fleet, 5_000);
  if (!result.ok) {
    fail(`expected a summary, got ${result.rejection.kind}`);
  }
  deepEqual(
    result.summary.entries.map((summaryEntry) => summaryEntry.presenceKey),
    ["agent-alpha", "agent-beta", "agent-gamma"],
  );
});

test("summarizePresence summarizes an empty fleet", () => {
  const result = summarizePresence([], 0);
  if (!result.ok) {
    fail(`expected a summary, got ${result.rejection.kind}`);
  }
  equal(result.summary.agentCount, 0);
  deepEqual(result.summary.entries, []);
  deepEqual(result.summary.byBadge, { following: 0, bound: 0, working: 0, blocked: 0, idle: 0 });
});

test("summarizePresence rejects duplicate presence keys", () => {
  const fleet = [
    presenceWith("agent-alpha", sha256Hex("summary-a")),
    presenceWith("agent-alpha", sha256Hex("summary-b")),
  ];
  const result = summarizePresence(fleet, 5_000);
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "duplicate-presence-key", presenceKey: "agent-alpha" });
});

test("summarizePresence rejects duplicate agent record digests", () => {
  const agent = sha256Hex("summary-same-agent");
  const fleet = [presenceWith("agent-alpha", agent), presenceWith("agent-beta", agent)];
  const result = summarizePresence(fleet, 5_000);
  if (result.ok) {
    fail("expected a rejection");
  }
  deepEqual(result.rejection, { kind: "duplicate-agent-record", agentRecord: agent });
});

test("summarizePresence is deterministic across shuffled input order", () => {
  const a = presenceWith("agent-alpha", sha256Hex("summary-a"));
  const b = presenceWith("agent-beta", sha256Hex("summary-b"));
  const c = presenceWith("agent-gamma", sha256Hex("summary-c"));
  const first = summarizePresence([a, b, c], 9_000);
  const second = summarizePresence([c, b, a], 9_000);
  if (!first.ok || !second.ok) {
    fail("expected summaries");
  }
  deepEqual(first.summary.entries, second.summary.entries);
  deepEqual(first.summary, second.summary);
});

test("summarizePresence validates records and the computed timestamp", () => {
  const presence = presenceWith("agent-alpha", sha256Hex("summary-a"));
  throws(() => summarizePresence([presence], -1), TypeError);
  throws(() => summarizePresence([{} as unknown as AgentPresence], 1_000), TypeError);
});
