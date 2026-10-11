/**
 * Package descriptor following the W028/W009 descriptor/module/index
 * pattern: the package's identity and its honest environment limits,
 * declared as executable data.
 */

import { LIFECYCLE_PHASE_ORDER } from "./phases.ts";
import { LIFECYCLE_SNAPSHOT_FORMAT } from "./persistence.ts";
import { DEFAULT_LIFECYCLE_POLICY_ID } from "./policy.ts";
import type { LifecyclePackageDescriptor } from "./types.ts";
import { deepFreeze } from "./validate.ts";

export const LIFECYCLE_PACKAGE_DESCRIPTOR: LifecyclePackageDescriptor = deepFreeze({
  name: "@zcode/epoch-lifecycle",
  workOrder: "W022",
  phaseOrder: [...LIFECYCLE_PHASE_ORDER],
  defaultPolicyId: DEFAULT_LIFECYCLE_POLICY_ID,
  snapshotFormat: LIFECYCLE_SNAPSHOT_FORMAT,
  constraints: {
    timestamps: false,
    wallClock: false,
    randomness: false,
    network: false,
    filesystem: false,
    worldWrites: false,
    modelCalls: false,
    training: false,
  } as const,
});
