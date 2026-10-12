import { describe, expect, it } from "vitest";
import {
  applyTransition,
  authorizeRelease,
  digestRefOf,
  evaluateIntake,
  openLifecycle,
  type MiniAppDescriptor,
  type ReleaseAuthorization,
} from "../../packages/epoch-capability-reproduction/src/index";
import {
  assertRefusal,
  releasePackage,
  releaseTransition,
  runGovernedPath,
  runToBenchmark,
  seedRef,
  unwrap,
  validDescriptor,
  validRequest,
  redQualityGates,
} from "./factories";

describe("reproduction lifecycle", () => {
  it("opens at intake bound to the request digest", () => {
    const lifecycle = unwrap(openLifecycle(validRequest()));
    expect(lifecycle.phase).toBe("intake");
    expect(lifecycle.requestRef.digest).toBe(
      digestRefOf(validRequest()).digest,
    );
  });

  it("governed path reaches release with a keyed release record", () => {
    const released = runGovernedPath();
    expect(released.phase).toBe("released");
    expect(released.history).toHaveLength(7);
    const record = released.release!;
    expect(record).not.toBeNull();
    expect(record.version).toBe("1.0.0");
    expect(record.releaseKey).toMatch(/^[0-9a-f]{64}$/);
    expect(record.limits).toEqual(releasePackage().limits);
  });

  it("records evidence-keyed transitions", () => {
    const released = runGovernedPath();
    const first = released.history[0]!;
    expect(first.kind).toBe("intake-accepted");
    expect(first.evidence).toEqual([seedRef("evidence-intake-accepted")]);
    expect(first.transitionKey).toMatch(/^[0-9a-f]{64}$/);
    for (const record of released.history) {
      expect(record.evidence.length).toBeGreaterThan(0);
    }
  });

  it("refuses out-of-order transitions", () => {
    const atBenchmark = runToBenchmark();
    assertRefusal(
      applyTransition(atBenchmark, {
        kind: "foundation-selected",
        evidence: [seedRef("late")],
        choiceRef: seedRef("too-late"),
      }),
      "wrong-phase",
    );
  });

  it("refuses an intake verdict for a different request", () => {
    const lifecycle = unwrap(openLifecycle(validRequest()));
    const otherVerdict = evaluateIntake({
      ...validRequest(),
      requestId: "req-999",
    });
    assertRefusal(
      applyTransition(lifecycle, {
        kind: "intake-accepted",
        evidence: [seedRef("evidence")],
        verdict: otherVerdict,
      }),
      "invalid-ref",
    );
  });

  it("intake rejection terminates the lifecycle", () => {
    let lifecycle = unwrap(openLifecycle(validRequest()));
    lifecycle = unwrap(
      applyTransition(lifecycle, {
        kind: "intake-rejected",
        evidence: [seedRef("evidence-reject")],
        verdict: {
          ...evaluateIntake(validRequest()),
          outcome: "reject" as const,
        },
      }),
    );
    expect(lifecycle.phase).toBe("rejected");
    assertRefusal(
      applyTransition(lifecycle, {
        kind: "alternatives-recorded",
        evidence: [seedRef("after-reject")],
        analysisRef: seedRef("never"),
      }),
      "wrong-phase",
    );
  });

  it("release is impossible when any gate fails", () => {
    // A red quality gate can never produce an all-gates-green authorization:
    // authorizeRelease itself refuses with a proper Result (codes present).
    assertRefusal(authorizeRelease(redQualityGates()), "gate-blocked");
    // The lifecycle re-verifies the authorization inside the release
    // transition, so a forged token cannot smuggle a red gate through.
    const forged = {
      ...releaseTransition(),
      authorization: {
        gates: redQualityGates(),
        gateRefs: [],
      } as unknown as ReleaseAuthorization,
    };
    assertRefusal(
      applyTransition(runToBenchmark(), forged),
      "release-unauthorized",
    );
  });

  it("release requires a workbench-bound descriptor", () => {
    const standalone = {
      ...validDescriptor(),
      integrationMode: "standalone-mcp",
    } as unknown as MiniAppDescriptor;
    const attempt = {
      ...releaseTransition(),
      release: { ...releasePackage(), descriptor: standalone },
    };
    assertRefusal(
      applyTransition(runToBenchmark(), attempt),
      "invalid-descriptor",
    );
  });

  it("rollback from released preserves version and limits", () => {
    const released = runGovernedPath();
    const rolled = unwrap(
      applyTransition(released, {
        kind: "rollback",
        input: {
          reason: "benchmark drift detected",
          evidence: [seedRef("rollback-evidence")],
          preserved: releasePackage().limits,
        },
      }),
    );
    expect(rolled.phase).toBe("rolled-back");
    const rollback = rolled.rollback!;
    expect(rollback.fromVersion).toBe("1.0.0");
    expect(rollback.preservedLimits).toEqual(releasePackage().limits);
    expect(rollback.rollbackKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rollback from released requires matching preserved limits", () => {
    const released = runGovernedPath();
    assertRefusal(
      applyTransition(released, {
        kind: "rollback",
        input: {
          reason: "benchmark drift detected",
          evidence: [seedRef("rollback-evidence")],
          preserved: {
            allowedSurfaces: ["other-surface"],
            dataAccess: ["read:none"],
            expiryCondition: "never",
          },
        },
      }),
      "rollback-mismatch",
    );
  });

  it("rollback is refused from disallowed phases", () => {
    const atIntake = unwrap(openLifecycle(validRequest()));
    assertRefusal(
      applyTransition(atIntake, {
        kind: "rollback",
        input: {
          reason: "too early",
          evidence: [seedRef("evidence")],
          preserved: null,
        },
      }),
      "wrong-phase",
    );
  });

  it("rollback from benchmark needs no preserved limits", () => {
    const rolled = unwrap(
      applyTransition(runToBenchmark(), {
        kind: "rollback",
        input: {
          reason: "benchmark aborted",
          evidence: [seedRef("rollback-evidence")],
          preserved: null,
        },
      }),
    );
    expect(rolled.phase).toBe("rolled-back");
    expect(rolled.rollback!.fromVersion).toBeNull();
  });
});
