import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  BLENDER_LICENSE_ID,
  BLENDER_TOOL_ID,
  FREECAD_LICENSE_ID,
  FREECAD_TOOL_ID,
  buildBlenderInvocationContract,
  buildBlenderLicenseRecord,
  buildBlenderToolDescriptor,
  buildFreecadInvocationContract,
  buildFreecadLicenseRecord,
  buildFreecadToolDescriptor,
  buildGeometryExchangeRecord,
  buildInvocationPlan,
  exchangeRecordDigest,
  formatExchangeRejection,
  formatInvocationRejection,
  presetBlenderObjExport,
  toDigest,
  toKebabId,
  toNonEmptyString,
  validateExchangeRecord,
  validateInvocationPlan,
} from "../src/index.js";
import type {
  CapabilityRegistry,
  ExchangeRejection,
  ExchangeValidation,
  FormatFidelityFlags,
  GeometryExchangeInput,
  GeometryExchangeRecord,
  InvocationContract,
  InvocationPlan,
  InvocationPlanInput,
  InvocationPlanRejection,
  InvocationPlanValidation,
  SemanticAuthorityKind,
  SemanticAuthorityRef,
} from "../src/index.js";

const blender = buildBlenderToolDescriptor({ toolVersion: "4.2.0" });
const freecad = buildFreecadToolDescriptor({ toolVersion: "1.0.0" });
const blenderContract = buildBlenderInvocationContract(blender);
const freecadContract = buildFreecadInvocationContract(freecad);
const blenderLicense = buildBlenderLicenseRecord({ toolVersion: "4.2.0" });
const freecadLicense = buildFreecadLicenseRecord({ toolVersion: "1.0.0" });

function registry(overrides: Partial<CapabilityRegistry> = {}): CapabilityRegistry {
  return {
    descriptors: overrides.descriptors ?? [blender, freecad],
    invocationContracts: overrides.invocationContracts ?? [blenderContract, freecadContract],
    licenseRecords: overrides.licenseRecords ?? [blenderLicense, freecadLicense],
    acceptedLicenseIds: overrides.acceptedLicenseIds ?? [BLENDER_LICENSE_ID, FREECAD_LICENSE_ID],
  };
}

function authorityRef(authorityKind: SemanticAuthorityKind): SemanticAuthorityRef {
  return {
    authorityKind,
    authorityId: toKebabId("epoch-occt-geometry"),
    authorityPackage: toNonEmptyString("@zcode/epoch-foundation-occt"),
    workOrderRef: toNonEmptyString("W011"),
    recordDigest: toDigest("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
    relationship: toNonEmptyString("owns the geometry semantics for the exchanged data"),
  };
}

function fidelityFlags(overrides: Partial<FormatFidelityFlags> = {}): FormatFidelityFlags {
  return {
    meshGeometry: false,
    brepGeometry: false,
    materials: false,
    textures: false,
    normals: false,
    uvCoordinates: false,
    animations: false,
    instancing: false,
    sceneHierarchy: false,
    unitsAndScaling: false,
    metadata: false,
    overallLossy: true,
    ...overrides,
  };
}

const blenderPlanInput: InvocationPlanInput = {
  planId: "export-scene-obj",
  toolId: "blender-bpy-headless",
  toolVersion: "4.2.0",
  contractId: "blender-bpy-headless-standard",
  purpose: "export-geometry",
  argvBindings: [
    { name: "script-path", values: ["<workdir>/scripts/export_obj.py"] },
    {
      name: "script-args",
      values: ["--input", "<workdir>/in/scene.blend", "--output", "<workdir>/out/scene.obj"],
    },
  ],
  requestedTimeoutMs: 300000,
  requestedGpu: false,
  requestedWritePaths: ["<workdir>/out/scene.obj"],
  inputFormat: "blend",
  outputFormat: "obj",
  createdAtUtc: "2025-01-15T09:30:00Z",
};

const freecadPlanInput: InvocationPlanInput = {
  planId: "convert-step-to-obj",
  toolId: "freecad-console",
  toolVersion: "1.0.0",
  contractId: "freecad-console-standard",
  purpose: "convert-geometry",
  argvBindings: [{ name: "script-path", values: ["<workdir>/scripts/convert.py"] }],
  requestedTimeoutMs: 600000,
  requestedGpu: false,
  requestedWritePaths: ["<workdir>/out/part.obj"],
  inputFormat: "step",
  outputFormat: "obj",
  createdAtUtc: "2025-01-15T09:30:00Z",
};

function blenderPlan(overrides: Partial<InvocationPlanInput> = {}): InvocationPlan {
  return buildInvocationPlan({ ...blenderPlanInput, ...overrides });
}

function freecadPlan(overrides: Partial<InvocationPlanInput> = {}): InvocationPlan {
  return buildInvocationPlan({ ...freecadPlanInput, ...overrides });
}

function acceptedPlan(result: InvocationPlanValidation) {
  if (result.kind !== "plan-accepted") {
    throw new Error(`expected plan-accepted, got: ${result.kind}`);
  }
  return result;
}

function rejectedPlan(result: InvocationPlanValidation): InvocationPlanRejection {
  if (result.kind !== "plan-rejected") {
    throw new Error(`expected plan-rejected, got: ${result.kind}`);
  }
  return result.reason;
}

function validExchange(result: ExchangeValidation) {
  if (result.kind !== "exchange-valid") {
    throw new Error(`expected exchange-valid, got: ${result.kind}`);
  }
  return result;
}

function rejectedExchange(result: ExchangeValidation): ExchangeRejection {
  if (result.kind !== "exchange-rejected") {
    throw new Error(`expected exchange-rejected, got: ${result.kind}`);
  }
  return result.reason;
}

function exchangeInput(overrides: Partial<GeometryExchangeInput> = {}): GeometryExchangeInput {
  return {
    exchangeId: "test-exchange",
    toolId: "blender-bpy-headless",
    toolVersion: "4.2.0",
    direction: "export",
    formatId: "obj",
    fileExtension: ".obj",
    fidelity: fidelityFlags(),
    semanticAuthorityRefs: [authorityRef("world-model")],
    toolSupport: "Blender built-in Wavefront OBJ exporter",
    ...overrides,
  };
}

test("accepts a valid Blender export plan and resolves argv", () => {
  const result = validateInvocationPlan(blenderPlan(), registry());
  const accepted = acceptedPlan(result);
  assert.deepEqual(accepted.resolvedArgv, [
    "--background",
    "--factory-startup",
    "--python",
    "<workdir>/scripts/export_obj.py",
    "--python-exit-code",
    "1",
    "--",
    "--input",
    "<workdir>/in/scene.blend",
    "--output",
    "<workdir>/out/scene.obj",
  ]);
  assert.equal(accepted.matchedToolId, BLENDER_TOOL_ID);
  assert.equal(accepted.matchedLicenseId, BLENDER_LICENSE_ID);
  assert.deepEqual(accepted.warnings, []);
  assert.match(accepted.planDigest, /^[0-9a-f]{64}$/);
});

test("accepted FreeCAD plans carry the exit-code honesty warning", () => {
  const result = validateInvocationPlan(freecadPlan(), registry());
  const accepted = acceptedPlan(result);
  assert.deepEqual(accepted.resolvedArgv, ["<workdir>/scripts/convert.py"]);
  assert.equal(accepted.matchedLicenseId, FREECAD_LICENSE_ID);
  assert.equal(accepted.warnings.length, 1);
  const warning = accepted.warnings[0];
  if (warning === undefined) {
    throw new Error("expected a warning");
  }
  assert.ok(warning.includes("exit 0"));
});

test("rejects unknown tools", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan({ toolId: "meshlab", toolVersion: "2023.12" }), registry()),
  );
  if (reason.kind !== "unknown-tool") {
    assert.fail(`expected unknown-tool, got ${reason.kind}`);
  }
  assert.equal(reason.toolId, "meshlab");
  assert.deepEqual(reason.knownToolIds, ["blender-bpy-headless", "freecad-console"]);
});

test("rejects tool version mismatches", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan({ toolVersion: "4.3.0" }), registry()),
  );
  if (reason.kind !== "tool-version-mismatch") {
    assert.fail(`expected tool-version-mismatch, got ${reason.kind}`);
  }
  assert.equal(reason.expectedVersion, "4.2.0");
  assert.equal(reason.planVersion, "4.3.0");
});

test("rejects unknown invocation contracts", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan({ contractId: "blender-legacy-v2" }), registry()),
  );
  if (reason.kind !== "unknown-invocation-contract") {
    assert.fail(`expected unknown-invocation-contract, got ${reason.kind}`);
  }
  assert.equal(reason.contractId, "blender-legacy-v2");
});

test("rejects contracts bound to a different descriptor revision", () => {
  const revised = buildBlenderToolDescriptor({ toolVersion: "4.2.0", descriptorRevision: 2 });
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan(), registry({ descriptors: [revised, freecad] })),
  );
  if (reason.kind !== "contract-descriptor-mismatch") {
    assert.fail(`expected contract-descriptor-mismatch, got ${reason.kind}`);
  }
  assert.equal(reason.contractId, "blender-bpy-headless-standard");
});

test("rejects purposes the contract does not allow", () => {
  const restricted: InvocationContract = { ...blenderContract, purposes: ["run-script"] };
  const reason = rejectedPlan(
    validateInvocationPlan(
      blenderPlan({ purpose: "export-geometry" }),
      registry({ invocationContracts: [restricted, freecadContract] }),
    ),
  );
  if (reason.kind !== "purpose-mismatch") {
    assert.fail(`expected purpose-mismatch, got ${reason.kind}`);
  }
  assert.equal(reason.planPurpose, "export-geometry");
});

test("rejects plans without a license record", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan(), registry({ licenseRecords: [freecadLicense] })),
  );
  if (reason.kind !== "missing-license-record") {
    assert.fail(`expected missing-license-record, got ${reason.kind}`);
  }
  assert.equal(reason.toolVersion, "4.2.0");
});

test("rejects tools whose license is not accepted", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan(), registry({ acceptedLicenseIds: [FREECAD_LICENSE_ID] })),
  );
  if (reason.kind !== "license-mismatch") {
    assert.fail(`expected license-mismatch, got ${reason.kind}`);
  }
  assert.equal(reason.toolLicenseId, BLENDER_LICENSE_ID);
  assert.deepEqual(reason.acceptedLicenseIds, ["lgpl-2.1-or-later"]);
});

test("rejects export plans without an output format", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan({ outputFormat: null }), registry()),
  );
  if (reason.kind !== "missing-required-format") {
    assert.fail(`expected missing-required-format, got ${reason.kind}`);
  }
  assert.equal(reason.field, "outputFormat");
  assert.equal(reason.purpose, "export-geometry");
});

test("rejects input formats the tool cannot import", () => {
  const plan = freecadPlan({
    planId: "import-blend-attempt",
    purpose: "import-geometry",
    inputFormat: "blend",
    outputFormat: null,
  });
  const reason = rejectedPlan(validateInvocationPlan(plan, registry()));
  if (reason.kind !== "unsupported-input-format") {
    assert.fail(`expected unsupported-input-format, got ${reason.kind}`);
  }
  assert.equal(reason.formatId, "blend");
  assert.ok(reason.supportedInputFormats.includes("step"));
});

test("rejects output formats the tool cannot export", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(
      blenderPlan({ purpose: "convert-geometry", inputFormat: "obj", outputFormat: "step" }),
      registry(),
    ),
  );
  if (reason.kind !== "unsupported-output-format") {
    assert.fail(`expected unsupported-output-format, got ${reason.kind}`);
  }
  assert.equal(reason.formatId, "step");
  assert.ok(reason.supportedOutputFormats.includes("obj"));
});

test("rejects plans missing required argv bindings", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan({ argvBindings: [] }), registry()),
  );
  if (reason.kind !== "missing-argv-binding") {
    assert.fail(`expected missing-argv-binding, got ${reason.kind}`);
  }
  assert.equal(reason.name, "script-path");
});

test("rejects unexpected argv bindings", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(
      blenderPlan({
        argvBindings: [
          ...blenderPlanInput.argvBindings,
          { name: "extra-flag", values: ["--verbose"] },
        ],
      }),
      registry(),
    ),
  );
  if (reason.kind !== "unexpected-argv-binding") {
    assert.fail(`expected unexpected-argv-binding, got ${reason.kind}`);
  }
  assert.equal(reason.name, "extra-flag");
  assert.deepEqual(reason.knownPlaceholderNames, ["script-path", "script-args"]);
});

test("rejects duplicate argv bindings", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(
      blenderPlan({
        argvBindings: [
          { name: "script-path", values: ["a.py"] },
          { name: "script-path", values: ["b.py"] },
        ],
      }),
      registry(),
    ),
  );
  if (reason.kind !== "duplicate-argv-binding") {
    assert.fail(`expected duplicate-argv-binding, got ${reason.kind}`);
  }
  assert.equal(reason.name, "script-path");
});

test("rejects wrong binding cardinality and empty values", () => {
  const cardinality = rejectedPlan(
    validateInvocationPlan(
      blenderPlan({ argvBindings: [{ name: "script-path", values: ["a.py", "b.py"] }] }),
      registry(),
    ),
  );
  if (cardinality.kind !== "argv-binding-cardinality") {
    assert.fail(`expected argv-binding-cardinality, got ${cardinality.kind}`);
  }
  assert.equal(cardinality.actual, 2);
  const empty = rejectedPlan(
    validateInvocationPlan(
      blenderPlan({ argvBindings: [{ name: "script-path", values: [""] }] }),
      registry(),
    ),
  );
  if (empty.kind !== "empty-argv-binding") {
    assert.fail(`expected empty-argv-binding, got ${empty.kind}`);
  }
  assert.equal(empty.name, "script-path");
});

test("rejects timeouts outside the contract range", () => {
  const tooLow = rejectedPlan(
    validateInvocationPlan(blenderPlan({ requestedTimeoutMs: 500 }), registry()),
  );
  if (tooLow.kind !== "timeout-out-of-range") {
    assert.fail(`expected timeout-out-of-range, got ${tooLow.kind}`);
  }
  assert.equal(tooLow.minTimeoutMs, 1000);
  assert.equal(tooLow.maxTimeoutMs, 1800000);
  const tooHigh = rejectedPlan(
    validateInvocationPlan(blenderPlan({ requestedTimeoutMs: 9999999 }), registry()),
  );
  if (tooHigh.kind !== "timeout-out-of-range") {
    assert.fail(`expected timeout-out-of-range, got ${tooHigh.kind}`);
  }
  assert.equal(tooHigh.requestedTimeoutMs, 9999999);
});

test("rejects write paths outside sandbox roots", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(blenderPlan({ requestedWritePaths: ["/etc/passwd"] }), registry()),
  );
  if (reason.kind !== "sandbox-violation") {
    assert.fail(`expected sandbox-violation, got ${reason.kind}`);
  }
  assert.equal(reason.requestedPath, "/etc/passwd");
  assert.deepEqual(reason.writableRoots, ["<workdir>/out/", "<workdir>/tmp/"]);
});

test("rejects gpu requests the sandbox denies", () => {
  const reason = rejectedPlan(
    validateInvocationPlan(freecadPlan({ requestedGpu: true }), registry()),
  );
  if (reason.kind !== "gpu-not-permitted") {
    assert.fail(`expected gpu-not-permitted, got ${reason.kind}`);
  }
  assert.equal(reason.toolId, "freecad-console");
});

test("rejects malformed plans", () => {
  const malformed = {
    ...blenderPlan(),
    argvBindings: [{ name: "not kebab", values: ["x"] }],
  } as unknown as InvocationPlan;
  const reason = rejectedPlan(validateInvocationPlan(malformed, registry()));
  if (reason.kind !== "malformed-plan") {
    assert.fail(`expected malformed-plan, got ${reason.kind}`);
  }
  assert.equal(reason.field, "argvBindings");
});

test("accepts a valid Blender OBJ export record", () => {
  const record = presetBlenderObjExport(blender, [authorityRef("world-model")]);
  const result = validExchange(validateExchangeRecord(record, registry()));
  assert.equal(result.recordDigest, exchangeRecordDigest(record));
  assert.match(result.recordDigest, /^[0-9a-f]{64}$/);
});

test("rejects unknown exchange formats", () => {
  const record = buildGeometryExchangeRecord(
    exchangeInput({ formatId: "quux-model", fileExtension: ".quux" }),
  );
  const reason = rejectedExchange(validateExchangeRecord(record, registry()));
  if (reason.kind !== "unknown-format") {
    assert.fail(`expected unknown-format, got ${reason.kind}`);
  }
  assert.equal(reason.formatId, "quux-model");
  assert.ok(reason.knownFormatIds.includes("obj"));
});

test("rejects formats the tool cannot use for the direction", () => {
  const record = buildGeometryExchangeRecord(
    exchangeInput({ formatId: "step", fileExtension: ".step" }),
  );
  const reason = rejectedExchange(validateExchangeRecord(record, registry()));
  if (reason.kind !== "format-not-supported-for-direction") {
    assert.fail(`expected format-not-supported-for-direction, got ${reason.kind}`);
  }
  assert.equal(reason.direction, "export");
  assert.ok(reason.supportedFormats.includes("obj"));
});

test("rejects extensions that do not match the format", () => {
  const record = buildGeometryExchangeRecord(exchangeInput({ fileExtension: ".ply" }));
  const reason = rejectedExchange(validateExchangeRecord(record, registry()));
  if (reason.kind !== "extension-mismatch") {
    assert.fail(`expected extension-mismatch, got ${reason.kind}`);
  }
  assert.equal(reason.fileExtension, ".ply");
  assert.deepEqual(reason.expectedExtensions, [".obj"]);
});

test("rejects brep fidelity claims on mesh-only formats", () => {
  const record = buildGeometryExchangeRecord(
    exchangeInput({ fidelity: fidelityFlags({ brepGeometry: true }) }),
  );
  const reason = rejectedExchange(validateExchangeRecord(record, registry()));
  if (reason.kind !== "fidelity-claim-unsupported") {
    assert.fail(`expected fidelity-claim-unsupported, got ${reason.kind}`);
  }
  assert.equal(reason.flag, "brepGeometry");
  assert.equal(reason.formatClass, "mesh");
});

test("rejects records without semantic authority references", () => {
  const record = buildGeometryExchangeRecord(exchangeInput({ semanticAuthorityRefs: [] }));
  const reason = rejectedExchange(validateExchangeRecord(record, registry()));
  if (reason.kind !== "missing-semantic-authority") {
    assert.fail(`expected missing-semantic-authority, got ${reason.kind}`);
  }
});

test("rejects brep fidelity without a geometry-kernel authority", () => {
  const record = buildGeometryExchangeRecord({
    exchangeId: "freecad-step-no-kernel-ref",
    toolId: "freecad-console",
    toolVersion: "1.0.0",
    direction: "export",
    formatId: "step",
    fileExtension: ".step",
    fidelity: fidelityFlags({ brepGeometry: true, unitsAndScaling: true, overallLossy: false }),
    semanticAuthorityRefs: [authorityRef("world-model")],
    toolSupport: "FreeCAD Part workbench STEP exporter (OCCT)",
  });
  const reason = rejectedExchange(validateExchangeRecord(record, registry()));
  if (reason.kind !== "brep-authority-required") {
    assert.fail(`expected brep-authority-required, got ${reason.kind}`);
  }
  assert.equal(reason.requiredAuthorityKind, "geometry-kernel");
});

test("rejects unknown tools and version mismatches in exchange records", () => {
  const unknown = buildGeometryExchangeRecord(
    exchangeInput({ toolId: "meshlab", toolVersion: "2023.12" }),
  );
  const unknownReason = rejectedExchange(validateExchangeRecord(unknown, registry()));
  if (unknownReason.kind !== "unknown-tool") {
    assert.fail(`expected unknown-tool, got ${unknownReason.kind}`);
  }
  assert.equal(unknownReason.toolId, "meshlab");
  const stale = buildGeometryExchangeRecord(exchangeInput({ toolVersion: "3.6.0" }));
  const staleReason = rejectedExchange(validateExchangeRecord(stale, registry()));
  if (staleReason.kind !== "tool-version-mismatch") {
    assert.fail(`expected tool-version-mismatch, got ${staleReason.kind}`);
  }
  assert.equal(staleReason.expectedVersion, "4.2.0");
  assert.equal(staleReason.recordVersion, "3.6.0");
});

test("rejects malformed exchange records", () => {
  const malformed = {
    ...presetBlenderObjExport(blender, [authorityRef("world-model")]),
    fileExtension: "obj",
  } as unknown as GeometryExchangeRecord;
  const reason = rejectedExchange(validateExchangeRecord(malformed, registry()));
  if (reason.kind !== "malformed-record") {
    assert.fail(`expected malformed-record, got ${reason.kind}`);
  }
  assert.equal(reason.field, "fileExtension");
});

test("rejection formatters cover every rejection kind", () => {
  const invocationSamples: readonly InvocationPlanRejection[] = [
    { kind: "malformed-plan", field: "planId", reason: "not a kebab id" },
    { kind: "unknown-tool", toolId: "x", knownToolIds: [] },
    { kind: "tool-version-mismatch", toolId: "x", expectedVersion: "1.0.0", planVersion: "2.0.0" },
    { kind: "unknown-invocation-contract", contractId: "x", knownContractIds: [] },
    { kind: "contract-descriptor-mismatch", contractId: "x", toolId: "x" },
    {
      kind: "purpose-mismatch",
      contractId: "x",
      allowedPurposes: ["run-script"],
      planPurpose: "export-geometry",
    },
    { kind: "missing-license-record", toolId: "x", toolVersion: "1.0.0" },
    {
      kind: "license-mismatch",
      toolId: "x",
      toolLicenseId: BLENDER_LICENSE_ID,
      acceptedLicenseIds: [],
    },
    { kind: "missing-required-format", field: "outputFormat", purpose: "export-geometry" },
    { kind: "unsupported-input-format", formatId: "x", toolId: "x", supportedInputFormats: [] },
    { kind: "unsupported-output-format", formatId: "x", toolId: "x", supportedOutputFormats: [] },
    { kind: "missing-argv-binding", name: "script-path", contractId: "x" },
    { kind: "unexpected-argv-binding", name: "x", knownPlaceholderNames: [] },
    { kind: "duplicate-argv-binding", name: "x" },
    {
      kind: "argv-binding-cardinality",
      name: "script-path",
      expected: "exactly one value",
      actual: 2,
    },
    { kind: "empty-argv-binding", name: "script-path" },
    {
      kind: "timeout-out-of-range",
      requestedTimeoutMs: 10,
      minTimeoutMs: 1000,
      maxTimeoutMs: 2000,
    },
    { kind: "sandbox-violation", requestedPath: "/etc/passwd", writableRoots: [] },
    { kind: "gpu-not-permitted", toolId: "x" },
  ];
  for (const sample of invocationSamples) {
    assert.ok(formatInvocationRejection(sample).length > 0);
  }
  const exchangeSamples: readonly ExchangeRejection[] = [
    { kind: "malformed-record", field: "fileExtension", reason: "missing dot" },
    { kind: "unknown-tool", toolId: "x", knownToolIds: [] },
    {
      kind: "tool-version-mismatch",
      toolId: "x",
      expectedVersion: "1.0.0",
      recordVersion: "2.0.0",
    },
    { kind: "unknown-format", formatId: "x", knownFormatIds: [] },
    {
      kind: "format-not-supported-for-direction",
      formatId: "step",
      direction: "export",
      toolId: "x",
      supportedFormats: [],
    },
    { kind: "extension-mismatch", fileExtension: ".ply", expectedExtensions: [".obj"] },
    {
      kind: "fidelity-claim-unsupported",
      flag: "brepGeometry",
      formatClass: "mesh",
      formatId: "obj",
    },
    { kind: "missing-semantic-authority" },
    { kind: "brep-authority-required", requiredAuthorityKind: "geometry-kernel" },
  ];
  for (const sample of exchangeSamples) {
    assert.ok(formatExchangeRejection(sample).length > 0);
  }
  assert.ok(
    formatInvocationRejection({ kind: "unknown-tool", toolId: "x", knownToolIds: [] }).includes(
      "unknown tool",
    ),
  );
  assert.ok(
    formatExchangeRejection({ kind: "missing-semantic-authority" }).includes("semantic authority"),
  );
});
