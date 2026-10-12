import { test } from "node:test";
import { deepEqual, equal, throws } from "node:assert/strict";
import {
  buildActivityRecordRef,
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
} from "../src/index.js";
import type { AgentPresenceIdentity } from "../src/index.js";

const AGENT = sha256Hex("presence-agent-record");
const TASK = sha256Hex("presence-task-record");
const ACTIVITY = sha256Hex("presence-activity-record");

function makeInput() {
  return {
    identity: buildAgentPresenceIdentity(AGENT, "agent-alpha"),
    position: buildWorldPosition(1, 2, 3),
    orientation: buildOrientation(Math.PI / 2),
    work: buildWorkDescriptor("active", "drafting wall", buildTaskRecordRef(TASK)),
    binding: buildNoneBinding(),
    follow: buildFollowNone(),
    recordedAt: 1_000,
  };
}

test("projectPresence derives a revision-0 presence record", () => {
  const presence = projectPresence(makeInput());
  equal(presence.kind, "agent-presence");
  equal(presence.revision, 0);
  equal(presence.identity.agentRecord, AGENT);
  equal(presence.identity.presenceKey, "agent-alpha");
  deepEqual(presence.position, { kind: "world-position", x: 1, y: 2, z: 3 });
  equal(presence.work.status, "active");
  equal(presence.work.label, "drafting wall");
  deepEqual(presence.follow, { kind: "follow-none" });
  deepEqual(presence.binding, { kind: "binding-none" });
  equal(presence.recordedAt, 1000);
  deepEqual(presence.derivation.semanticRecords, [{ kind: "task-record", digest: TASK }]);
  equal(presence.derivation.projectedAt, 1000);
});

test("projectPresence accepts an initial follow target or entity binding", () => {
  const following = projectPresence({ ...makeInput(), follow: buildCameraFollowTarget() });
  deepEqual(following.follow, { kind: "follow-camera" });
  const bound = projectPresence({
    ...makeInput(),
    binding: buildEntityBinding(sha256Hex("presence-entity")),
  });
  deepEqual(bound.binding, { kind: "binding-entity", entity: sha256Hex("presence-entity") });
});

test("projectPresence records additional semantic records in input order", () => {
  const presence = projectPresence({
    ...makeInput(),
    additionalSemanticRecords: [buildActivityRecordRef(ACTIVITY)],
  });
  deepEqual(presence.derivation.semanticRecords, [
    { kind: "task-record", digest: TASK },
    { kind: "activity-record", digest: ACTIVITY },
  ]);
});

test("projectPresence rejects duplicate semantic record references", () => {
  throws(
    () =>
      projectPresence({ ...makeInput(), additionalSemanticRecords: [buildTaskRecordRef(TASK)] }),
    /duplicate semantic record reference/,
  );
});

test("projectPresence rejects binding and following at the same time", () => {
  throws(
    () =>
      projectPresence({
        ...makeInput(),
        binding: buildEntityBinding(sha256Hex("presence-entity")),
        follow: buildCameraFollowTarget(),
      }),
    /cannot be bound and following/,
  );
});

test("projectPresence validates malformed input structurally", () => {
  throws(() => projectPresence({ ...makeInput(), recordedAt: -1 }), TypeError);
  throws(() => projectPresence({ ...makeInput(), recordedAt: 1.5 }), TypeError);
  throws(
    () =>
      projectPresence({
        ...makeInput(),
        identity: { kind: "agent-presence-identity" } as unknown as AgentPresenceIdentity,
      }),
    TypeError,
  );
});
