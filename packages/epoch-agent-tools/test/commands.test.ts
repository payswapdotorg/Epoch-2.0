/**
 * W024 — Agent Tools: command-contract tests — validation of every command
 * kind, params shapes, provenance and the authorization reference.
 */
import { describe, expect, it } from "vitest";
import { AGENT_COMMAND_KINDS } from "../src/kinds.js";
import { validateAgentCommand } from "../src/commands.js";
import type { AgentCommand } from "../src/commands.js";
import { command } from "./helpers/harness.js";

describe("command contracts", () => {
  it("validates every well-formed command kind", () => {
    for (const kind of AGENT_COMMAND_KINDS) {
      const validation = validateAgentCommand(command(kind));
      expect(validation.ok, `kind ${kind} must validate`).toBe(true);
    }
  });

  it("rejects non-object commands", () => {
    const validation = validateAgentCommand(null);
    expect(validation.ok).toBe(false);
  });

  it("rejects unknown command kinds", () => {
    const validation = validateAgentCommand({ kind: "solution.explode" });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues[0]).toContain("unknown command kind");
    }
  });

  it("rejects a missing sessionId", () => {
    const input = command("solution.open") as Record<string, unknown>;
    delete input["sessionId"];
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("sessionId");
    }
  });

  it("rejects a missing authorization reference", () => {
    const input = command("solution.open") as Record<string, unknown>;
    delete input["authorization"];
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("authorization");
    }
  });

  it("rejects a missing provenance agentId", () => {
    const input = command("solution.open") as Record<string, unknown>;
    (input["provenance"] as Record<string, unknown>)["agentId"] = "";
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("agentId");
    }
  });

  it("rejects solution.select with elementIds for mode clear", () => {
    const input = command("solution.select") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = { mode: "clear", elementIds: ["el-1"] };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("clear");
    }
  });

  it("rejects solution.select without elementIds for non-clear modes", () => {
    const input = command("solution.select") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = { mode: "replace", elementIds: [] };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
  });

  it("rejects solution.navigate with an invalid target kind", () => {
    const input = command("solution.navigate") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = { target: { kind: "orbit" } };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("target.kind");
    }
  });

  it("rejects solution.measure with a malformed anchor", () => {
    const input = command("solution.measure") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = {
      kind: "distance",
      from: { kind: "point", point: [0, 0] },
      to: { kind: "point", point: [1, 1, 1] },
    };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("from.point");
    }
  });

  it("rejects solution.annotate add without text", () => {
    const input = command("solution.annotate") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = { action: "add", annotationId: "note-1" };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("text");
    }
  });

  it("rejects solution.simulate with non-scalar input values", () => {
    const input = command("solution.simulate") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = {
      scenarioId: "daylight",
      inputs: { factor: { nested: true } },
    };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.join("; ")).toContain("inputs");
    }
  });

  it("accepts solution.measure clear", () => {
    const input = command("solution.measure") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = { kind: "clear" };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(true);
  });

  it("accepts solution.isolate show-all with empty elementIds", () => {
    const input = command("solution.isolate") as unknown as Record<
      string,
      unknown
    >;
    input["params"] = { mode: "show-all", elementIds: [] };
    const validation = validateAgentCommand(input);
    expect(validation.ok).toBe(true);
  });

  it("exposes a discriminated union covering all nine kinds", () => {
    const sample: AgentCommand["kind"][] = [
      "solution.open",
      "solution.select",
      "solution.inspect",
      "solution.navigate",
      "solution.isolate",
      "solution.measure",
      "solution.annotate",
      "solution.simulate",
      "solution.observe",
    ];
    expect(sample.sort()).toEqual([...AGENT_COMMAND_KINDS].sort());
  });
});
