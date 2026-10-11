/**
 * W024 — Agent Tools: changed-behavior tests — one round-trip per command
 * kind through the dispatcher against the provider-neutral fakes, plus
 * session lifecycle and preconditions.
 */
import { describe, expect, it } from "vitest";
import { AGENT_COMMAND_KINDS } from "../src/kinds.js";
import {
  IllegalCommandError,
  SessionAlreadyExistsError,
  SessionNotFoundError,
} from "../src/errors.js";
import type { AgentCommandKind } from "../src/kinds.js";
import {
  command,
  createHarness,
  fullAuthorization,
  openSession,
} from "./helpers/harness.js";
import type { Harness } from "./helpers/harness.js";

describe("dispatcher round-trips", () => {
  it("round-trips every command kind and returns typed value payloads", async () => {
    const harness = createHarness();
    const { dispatcher } = harness;
    dispatcher.createSession("session-1");
    for (const kind of AGENT_COMMAND_KINDS) {
      const result = await dispatcher.dispatch(
        command(kind) as never,
        fullAuthorization(),
      );
      expect(result.kind, `kind ${kind}`).toBe(kind);
      expect(result.status).toBe("executed");
      expect(result.sessionId).toBe("session-1");
      expect(typeof result.commandDigest).toBe("string");
      expect(result.commandDigest).toHaveLength(64);
      expect(
        result.value,
        `kind ${kind} must carry a value payload`,
      ).toBeTruthy();
    }
    const descriptor = dispatcher.getSession("session-1");
    expect(descriptor.commandCount).toBe(AGENT_COMMAND_KINDS.length);
    expect(descriptor.outcomeCounts.succeeded).toBe(AGENT_COMMAND_KINDS.length);
    expect(descriptor.outcomeCounts.denied).toBe(0);
    expect(descriptor.openSolution?.solutionId).toBe("sol-1");
  });

  it("solution.open returns engine-agnostic solution info", async () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    const result = await harness.dispatcher.dispatch(
      command("solution.open") as never,
      fullAuthorization(),
    );
    expect(result.value.solution).toEqual({
      solutionId: "sol-1",
      revision: "rev-1",
      elementCount: 3,
      title: "Test Solution",
      schemaVersion: "1.0.0",
    });
  });

  it("solution.select routes to the interaction port and reports the selection", async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(
      command("solution.select") as never,
      fullAuthorization(),
    );
    expect(result.value.selection.selectedElementIds).toEqual(["el-1"]);
    expect(result.value.selection.changed).toBe(true);
    expect(
      harness.interaction.calls.some(
        (call) => call.method === "applySelection",
      ),
    ).toBe(true);
  });

  it("solution.inspect returns element reports with properties and relations", async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(
      command("solution.inspect") as never,
      fullAuthorization(),
    );
    expect(result.value.elements).toHaveLength(2);
    expect(result.value.elements[0]?.properties?.["height"]).toBe(3.2);
    expect(result.value.elements[0]?.relations?.[0]?.relation).toBe(
      "connected-to",
    );
  });

  it("solution.navigate returns a viewpoint value, never a renderer camera", async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(
      command("solution.navigate") as never,
      fullAuthorization(),
    );
    const viewpoint = result.value.navigation.viewpoint;
    expect(Array.isArray(viewpoint.target)).toBe(true);
    expect(typeof viewpoint.distance).toBe("number");
    expect(result.value.navigation.applied).toBe(true);
  });

  it("solution.isolate reports the isolated element ids", async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(
      command("solution.isolate") as never,
      fullAuthorization(),
    );
    expect(result.value.isolation.isolatedElementIds).toEqual(["el-1"]);
  });

  it("solution.measure computes a distance between point anchors", async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(
      command("solution.measure") as never,
      fullAuthorization(),
    );
    expect(result.value.measurement).toEqual({ kind: "distance", distance: 5 });
  });

  it("solution.measure clear reports cleared measurements", async () => {
    const harness = createHarness();
    await openSession(harness);
    const cmd = command("solution.measure") as unknown as Record<
      string,
      unknown
    >;
    cmd["params"] = { kind: "clear" };
    const result = await harness.dispatcher.dispatch(
      cmd as never,
      fullAuthorization(),
    );
    expect(result.value.measurement).toEqual({
      kind: "clear",
      clearedMeasurements: 1,
    });
  });

  it("solution.annotate add returns the annotation snapshot", async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(
      command("solution.annotate") as never,
      fullAuthorization(),
    );
    expect(result.value.annotation.action).toBe("add");
    expect(result.value.annotation.annotation.text).toBe("check this");
  });

  it("solution.simulate returns scenario metrics", async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(
      command("solution.simulate") as never,
      fullAuthorization(),
    );
    expect(result.value.simulation.scenarioId).toBe("daylight");
    expect(result.value.simulation.metrics["illuminance"]).toBe(1000);
  });

  it("solution.observe reports open solution and interaction state", async () => {
    const harness = createHarness();
    await openSession(harness);
    await harness.dispatcher.dispatch(
      command("solution.select") as never,
      fullAuthorization(),
    );
    const result = await harness.dispatcher.dispatch(
      command("solution.observe") as never,
      fullAuthorization(),
    );
    expect(result.value.observation.openSolution?.solutionId).toBe("sol-1");
    expect(result.value.observation.interaction?.selectedElementIds).toEqual([
      "el-1",
    ]);
  });

  it("solution.observe omits interaction state when asked", async () => {
    const harness = createHarness();
    await openSession(harness);
    const cmd = command("solution.observe") as unknown as Record<
      string,
      unknown
    >;
    cmd["params"] = { includeInteractionState: false };
    const result = await harness.dispatcher.dispatch(
      cmd as never,
      fullAuthorization(),
    );
    expect(result.value.observation.interaction).toBeNull();
  });
});

describe("dispatcher sessions and preconditions", () => {
  it("rejects dispatch to an unattached session with a typed error", async () => {
    const harness = createHarness();
    await expect(
      harness.dispatcher.dispatch(
        command("solution.open", "ghost") as never,
        fullAuthorization(),
      ),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("rejects duplicate session creation", () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    expect(() => harness.dispatcher.createSession("session-1")).toThrow(
      SessionAlreadyExistsError,
    );
  });

  it("rejects commands that require an open solution", async () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    await expect(
      harness.dispatcher.dispatch(
        command("solution.select") as never,
        fullAuthorization(),
      ),
    ).rejects.toBeInstanceOf(IllegalCommandError);
  });

  it("replays an identical command without re-executing the ports", async () => {
    const harness = createHarness();
    await openSession(harness);
    const first = await harness.dispatcher.dispatch(
      command("solution.select") as never,
      fullAuthorization(),
    );
    const surfaceCalls = harness.surface.calls.length;
    const interactionCalls = harness.interaction.calls.length;
    const second = await harness.dispatcher.dispatch(
      command("solution.select") as never,
      fullAuthorization(),
    );
    expect(second.status).toBe("replayed");
    expect(second.commandDigest).toBe(first.commandDigest);
    expect(second.value).toEqual(first.value);
    expect(harness.surface.calls.length).toBe(surfaceCalls);
    expect(harness.interaction.calls.length).toBe(interactionCalls);
  });

  it("treats a different correlationId as a distinct command", async () => {
    const harness = createHarness();
    await openSession(harness);
    const first = await harness.dispatcher.dispatch(
      command("solution.select", "session-1", "token-1", "c-1") as never,
      fullAuthorization(),
    );
    const second = await harness.dispatcher.dispatch(
      command("solution.select", "session-1", "token-1", "c-2") as never,
      fullAuthorization(),
    );
    expect(second.status).toBe("executed");
    expect(second.commandDigest).not.toBe(first.commandDigest);
  });

  it("wraps port failures in typed AgentPortError", async () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    const cmd = command("solution.open") as unknown as Record<string, unknown>;
    cmd["params"] = { solutionId: "missing" };
    const error = await harness.dispatcher
      .dispatch(cmd as never, fullAuthorization())
      .catch((e) => e);
    expect(error.constructor.name).toBe("AgentPortError");
    expect(error.code).toBe("port-error");
    expect(error.port).toBe("solution-surface");
    expect(harness.worldStore.appends).toHaveLength(0);
  });
});
