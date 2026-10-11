/**
 * Shared test helpers for the W022 lifecycle test battery.
 */

import * as assert from "node:assert";
import { LifecycleError } from "../src/index.ts";
import type { LifecycleMachine, LifecyclePhaseId, LifecycleState } from "../src/index.ts";

export const ANCHOR = { kind: "solution", digest: "sha256:solution-fixture-1" } as const;

export const ORDER: readonly LifecyclePhaseId[] = [
  "understand",
  "decide",
  "plan",
  "acquire",
  "realize",
  "observe",
  "verify",
  "forecast",
  "close",
  "learn",
];

/** Walk a solution forward along the standard chain until it reaches `target`. */
export function walkTo(machine: LifecycleMachine, state: LifecycleState, target: LifecyclePhaseId): LifecycleState {
  let current = state;
  while (current.phase !== target) {
    const index = ORDER.indexOf(current.phase);
    const nextPhase = ORDER[index + 1];
    if (nextPhase === undefined) {
      throw new Error(`cannot walk forward past "${current.phase}"`);
    }
    current = machine.advance(current, {
      to: nextPhase,
      reason: `walk to ${nextPhase}`,
      evidence: [`walk:${nextPhase}`],
    });
  }
  return current;
}

/** Assert that `fn` throws a LifecycleError carrying exactly `code`. */
export function expectLifecycleError(code: string, fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => error instanceof LifecycleError && error.code === code);
}
