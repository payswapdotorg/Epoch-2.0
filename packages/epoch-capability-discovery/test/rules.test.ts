import { describe, expect, it } from "vitest";
import { defaultDiscoveryPolicy, definePolicy, init } from "../src/index.ts";
import type {
  CapabilityEvidence,
  DiscoveryMachine,
  DiscoveryResult,
  DiscoveryRule,
  PromotionThresholds,
} from "../src/index.ts";

const SYNTH_RULE: DiscoveryRule = {
  id: "rule/synth",
  description: "completed tasks suggest solution synthesis",
  match: { evidenceKind: "task.completed" },
  candidate: {
    roleId: "capability.role/solution-synthesis",
    scope: { appliesTo: ["task"] },
  },
  weight: 1,
};

function policy(
  rules: DiscoveryRule[],
  promotion: PromotionThresholds,
  enabledRuleIds?: string[],
) {
  return definePolicy({ rules, promotion, enabledRuleIds });
}

function evidence(kind: string, payloadDigest: string): CapabilityEvidence {
  return { kind, payloadDigest, sourceRefs: [] };
}

function drive(
  machine: DiscoveryMachine,
  kinds: readonly string[],
): {
  state: ReturnType<DiscoveryMachine["initialState"]>;
  results: DiscoveryResult[];
} {
  let state = machine.initialState();
  const results: DiscoveryResult[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const evaluation = machine.evaluate(
      state,
      evidence(kinds[i] as string, `p${i}`.padEnd(64, "0")),
    );
    state = evaluation.state;
    results.push(evaluation.result);
  }
  return { state, results };
}

describe("changed-behavior: rules and thresholds", () => {
  it("minEvidenceCount gates acceptance at the exact boundary", () => {
    const machine = init(
      policy([SYNTH_RULE], {
        minEvidenceCount: 3,
        minConfidence: 0.5,
        maxConfidence: 1,
      }),
    );
    const { state, results } = drive(machine, [
      "task.completed",
      "task.completed",
      "task.completed",
    ]);
    expect(results[0]?.rejected[0]?.reason).toBe("below-min-evidence");
    expect(results[1]?.rejected[0]?.reason).toBe("below-min-evidence");
    expect(results[2]?.accepted).toHaveLength(1);
    expect(state.capabilities).toHaveLength(1);
    expect(state.capabilities[0]?.discoveredAtStep).toBe(3);
  });

  it("minConfidence gates acceptance independently of the evidence count", () => {
    const machine = init(
      policy([SYNTH_RULE], {
        minEvidenceCount: 1,
        minConfidence: 0.8,
        maxConfidence: 1,
      }),
    );
    const { results } = drive(
      machine,
      Array.from({ length: 4 }, () => "task.completed"),
    );
    expect(results[2]?.rejected[0]?.reason).toBe("below-min-confidence");
    expect(results[3]?.accepted).toHaveLength(1);
    expect(results[3]?.accepted[0]?.confidence).toBe(0.8);
  });

  it("rule weight changes confidence and therefore the promotion step", () => {
    const heavy = init(
      policy([{ ...SYNTH_RULE, weight: 1 }], {
        minEvidenceCount: 1,
        minConfidence: 0.6,
        maxConfidence: 1,
      }),
    );
    const light = init(
      policy([{ ...SYNTH_RULE, weight: 0.3 }], {
        minEvidenceCount: 1,
        minConfidence: 0.6,
        maxConfidence: 1,
      }),
    );
    const heavyRun = drive(heavy, ["task.completed", "task.completed"]);
    const lightRun = drive(light, [
      "task.completed",
      "task.completed",
      "task.completed",
      "task.completed",
      "task.completed",
    ]);
    expect(heavyRun.results[0]?.rejected[0]?.reason).toBe(
      "below-min-confidence",
    ); // w=1, n=1 → 0.5
    expect(heavyRun.results[1]?.accepted).toHaveLength(1); // w=1, n=2 → 0.666667
    expect(lightRun.results.map((r) => r.accepted.length)).toEqual([
      0, 0, 0, 0, 1,
    ]); // w=0.3, n=5 → 0.6
  });

  it("disabling a rule changes the outcome to rule-not-enabled without recording observations", () => {
    const enabled = init(
      policy(
        [SYNTH_RULE],
        { minEvidenceCount: 1, minConfidence: 0.5, maxConfidence: 1 },
        ["rule/synth"],
      ),
    );
    const disabled = init(
      policy(
        [SYNTH_RULE],
        { minEvidenceCount: 1, minConfidence: 0.5, maxConfidence: 1 },
        [],
      ),
    );
    const enabledRun = drive(enabled, ["task.completed"]);
    const disabledRun = drive(disabled, ["task.completed"]);
    expect(enabledRun.state.capabilities).toHaveLength(1);
    expect(disabledRun.state.capabilities).toHaveLength(0);
    expect(disabledRun.state.observations).toHaveLength(0);
    expect(disabledRun.results[0]?.rejected[0]?.reason).toBe(
      "rule-not-enabled",
    );
    expect(disabledRun.results[0]?.matchedRuleIds).toEqual(["rule/synth"]);
  });

  it("subjectKind and payloadDigestIn filters narrow rule matching", () => {
    const scopedRule: DiscoveryRule = {
      ...SYNTH_RULE,
      match: { evidenceKind: "task.completed", subjectKind: "task" },
    };
    const machine = init(
      policy([scopedRule], {
        minEvidenceCount: 1,
        minConfidence: 0,
        maxConfidence: 1,
      }),
    );
    const withWrongSubject: CapabilityEvidence = {
      kind: "task.completed",
      payloadDigest: "a".repeat(64),
      sourceRefs: [],
      subject: { kind: "problem" },
    };
    expect(
      machine.evaluate(machine.initialState(), withWrongSubject).result
        .matchedRuleIds,
    ).toEqual([]);
    const withRightSubject: CapabilityEvidence = {
      ...withWrongSubject,
      subject: { kind: "task" },
    };
    expect(
      machine.evaluate(machine.initialState(), withRightSubject).result
        .matchedRuleIds,
    ).toEqual(["rule/synth"]);

    const digestRule: DiscoveryRule = {
      ...SYNTH_RULE,
      match: { payloadDigestIn: ["f".repeat(64)] },
    };
    const digestMachine = init(
      policy([digestRule], {
        minEvidenceCount: 1,
        minConfidence: 0,
        maxConfidence: 1,
      }),
    );
    expect(
      digestMachine.evaluate(
        digestMachine.initialState(),
        evidence("task.completed", "a".repeat(64)),
      ).result.matchedRuleIds,
    ).toEqual([]);
    expect(
      digestMachine.evaluate(
        digestMachine.initialState(),
        evidence("task.completed", "f".repeat(64)),
      ).result.matchedRuleIds,
    ).toEqual(["rule/synth"]);
  });

  it("minOccurrences defers promotion until enough evidence has accumulated", () => {
    const patient: DiscoveryRule = {
      ...SYNTH_RULE,
      match: { evidenceKind: "task.completed", minOccurrences: 3 },
    };
    const machine = init(
      policy([patient], {
        minEvidenceCount: 1,
        minConfidence: 0,
        maxConfidence: 1,
      }),
    );
    const { results } = drive(machine, [
      "task.completed",
      "task.completed",
      "task.completed",
    ]);
    expect(results[0]?.matchedRuleIds).toEqual(["rule/synth"]);
    expect(results[0]?.rejected[0]?.reason).toBe("below-min-evidence");
    expect(results[1]?.rejected[0]?.reason).toBe("below-min-evidence");
    expect(results[2]?.accepted).toHaveLength(1);
  });

  it('duplicate matches after acceptance are recorded as rejections with reason "duplicate"', () => {
    const machine = init(
      policy([SYNTH_RULE], {
        minEvidenceCount: 2,
        minConfidence: 0,
        maxConfidence: 1,
      }),
    );
    const { state, results } = drive(machine, [
      "task.completed",
      "task.completed",
      "task.completed",
    ]);
    expect(results[1]?.accepted).toHaveLength(1);
    expect(results[2]?.rejected[0]?.reason).toBe("duplicate");
    expect(state.capabilities).toHaveLength(1);
    expect(
      state.rejections.filter((rejection) => rejection.reason === "duplicate"),
    ).toHaveLength(1);
  });

  it("each default rule promotes according to its own weight and the shared thresholds", () => {
    const failMachine = init(defaultDiscoveryPolicy());
    const failRun = drive(failMachine, [
      "task.failed",
      "task.failed",
      "task.failed",
    ]);
    expect(
      failRun.results[2]?.accepted.map((capability) => capability.roleId),
    ).toEqual([
      "capability.role/verification-review", // w=0.4, n=3 → 0.545455 ≥ 0.5
    ]);

    const interactionMachine = init(defaultDiscoveryPolicy());
    let state = interactionMachine.initialState();
    const results: DiscoveryResult[] = [];
    for (let i = 0; i < 4; i++) {
      const evaluation = interactionMachine.evaluate(
        state,
        evidence("interaction.observed", `i${i}`.padEnd(64, "0")),
      );
      state = evaluation.state;
      results.push(evaluation.result);
    }
    expect(results[2]?.rejected[0]?.reason).toBe("below-min-confidence"); // w=0.3, n=3 → 0.473684
    expect(results[3]?.accepted.map((capability) => capability.roleId)).toEqual(
      [
        "capability.role/interaction-clarification", // w=0.3, n=4 → 0.545455
      ],
    );
  });
});
