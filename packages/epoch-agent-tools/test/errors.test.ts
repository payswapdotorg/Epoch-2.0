/**
 * W024 — Agent Tools: typed error taxonomy tests — illegal commands are
 * typed errors, never silent corrections.
 */
import { describe, expect, it } from "vitest";
import { AgentToolDispatcher } from "../src/dispatcher.js";
import {
  AgentPortError,
  AgentToolsError,
  AuthorizationError,
  IllegalCommandError,
  SessionNotFoundError,
  UnknownCommandKindError,
} from "../src/errors.js";
import {
  command,
  createHarness,
  fullAuthorization,
} from "./helpers/harness.js";

describe("typed errors", () => {
  it("illegal commands raise IllegalCommandError with every issue listed", async () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    const cmd = command("solution.open") as unknown as Record<string, unknown>;
    cmd["params"] = { solutionId: "" };
    const error = await harness.dispatcher
      .dispatch(cmd as never, fullAuthorization())
      .catch((e) => e);
    expect(error).toBeInstanceOf(IllegalCommandError);
    expect(error).toBeInstanceOf(AgentToolsError);
    expect(error.code).toBe("illegal-command");
    expect(error.issues.join("; ")).toContain("solutionId");
  });

  it("unknown kinds raise UnknownCommandKindError", async () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    const error = await harness.dispatcher
      .dispatch({ kind: "solution.explode" } as never, fullAuthorization())
      .catch((e) => e);
    expect(error).toBeInstanceOf(UnknownCommandKindError);
    expect(error).toBeInstanceOf(IllegalCommandError);
    expect(error.kind).toBe("solution.explode");
    expect(error.code).toBe("unknown-command-kind");
  });

  it("authorization denials raise AuthorizationError with a denied reason", async () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    const error = await harness.dispatcher
      .dispatch(command("solution.open") as never, {
        tokenId: "token-1",
        subject: "agent-1",
        allowedCommands: [],
        scopes: [],
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.deniedReason).toBe("command-kind-not-authorized");
  });

  it("port failures are wrapped in AgentPortError with the port name", async () => {
    const harness = createHarness();
    harness.dispatcher.createSession("session-1");
    const cmd = command("solution.open") as unknown as Record<string, unknown>;
    cmd["params"] = { solutionId: "missing" };
    const error = await harness.dispatcher
      .dispatch(cmd as never, fullAuthorization())
      .catch((e) => e);
    expect(error).toBeInstanceOf(AgentPortError);
    expect(error.port).toBe("solution-surface");
    expect(error.commandKind).toBe("solution.open");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("missing sessions raise SessionNotFoundError with the session id", async () => {
    const harness = createHarness();
    const error = await harness.dispatcher
      .dispatch(command("solution.open", "ghost") as never, fullAuthorization())
      .catch((e) => e);
    expect(error).toBeInstanceOf(SessionNotFoundError);
    expect(error.sessionId).toBe("ghost");
  });

  it("every error carries a stable code", () => {
    const cases = [
      new IllegalCommandError(["issue"]),
      new UnknownCommandKindError("nope"),
      new SessionNotFoundError("s"),
      new AgentPortError("solution-surface", "solution.open", new Error("x")),
    ];
    const codes = cases.map((error) => error.code);
    expect(codes).toEqual([
      "illegal-command",
      "unknown-command-kind",
      "session-not-found",
      "port-error",
    ]);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it("constructor options validation raises TypeError", () => {
    expect(() => new AgentToolDispatcher({} as never)).toThrow(TypeError);
    expect(() => new AgentToolDispatcher(null as never)).toThrow(TypeError);
    expect(
      () =>
        new AgentToolDispatcher({
          surface: {},
          interaction: {},
          worldStore: {},
        } as never),
    ).toThrow(TypeError);
  });
});
