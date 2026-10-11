import { describe, expect, it } from "vitest";
import {
  authorizeRelease,
  detectMcpWrapperSignals,
  validateMiniAppDescriptor,
  type MiniAppDescriptor,
} from "../../packages/epoch-capability-reproduction/src/index";
import {
  assertRefusal,
  greenGates,
  redQualityGates,
  seedRef,
  unwrap,
  validDescriptor,
} from "./factories";

describe("workbench surface binding", () => {
  it("accepts a descriptor that opens through the workbench surface", () => {
    const result = unwrap(validateMiniAppDescriptor(validDescriptor()));
    expect(result.descriptor.integrationMode).toBe("epoch-workbench-surface");
    expect(result.descriptorRef.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a standalone integration mode", () => {
    const standalone = {
      ...validDescriptor(),
      integrationMode: "standalone-mcp",
    } as unknown as MiniAppDescriptor;
    assertRefusal(
      validateMiniAppDescriptor(standalone),
      "wrong-integration-mode",
    );
  });

  it("refuses a non-Epoch surface authority", () => {
    const hijacked = {
      ...validDescriptor(),
      surface: { ...validDescriptor().surface, surfaceAuthority: "mcp.gateway" },
    } as unknown as MiniAppDescriptor;
    assertRefusal(validateMiniAppDescriptor(hijacked), "wrong-surface-authority");
  });

  it("detects MCP wrapper markers at depth", () => {
    expect(detectMcpWrapperSignals({ mcp: true })).toEqual(["mcp"]);
    expect(detectMcpWrapperSignals({ a: { b: { mcpTransport: 1 } } })).toEqual([
      "mcpTransport",
    ]);
    expect(detectMcpWrapperSignals({ surface: seedRef("clean") })).toEqual([]);
  });

  it("refuses a descriptor carrying MCP wrapper signals", () => {
    const wrapped = {
      ...validDescriptor(),
      mcpServer: { url: "https://wrapper.example" },
    } as unknown as MiniAppDescriptor;
    assertRefusal(validateMiniAppDescriptor(wrapped), "mcp-wrapper-detected");
  });
});

describe("release authorization", () => {
  it("authorizes release when all six gates are green with evidence", () => {
    const authorization = unwrap(authorizeRelease(greenGates()));
    expect(authorization.gateRefs).toHaveLength(6);
  });

  it("refuses a red quality gate", () => {
    assertRefusal(authorizeRelease(redQualityGates()), "gate-blocked");
  });

  it("refuses a missing gate", () => {
    const missing = greenGates().filter((gate) => gate.gate !== "safety");
    assertRefusal(authorizeRelease(missing), "insufficient-evidence");
  });

  it("refuses gates without evidence", () => {
    const empty = greenGates().map((gate) => ({
      ...gate,
      evidence: [] as typeof gate.evidence,
    }));
    assertRefusal(authorizeRelease(empty), "insufficient-evidence");
  });
});
