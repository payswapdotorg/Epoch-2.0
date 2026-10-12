import { sha256Canonical } from "../canonical.js";
import { toKebabId, toUtcTimestamp } from "../validate.js";
import type { Digest } from "../types/brands.js";
import type { Limitation, LimitationsReport } from "../types/limitations.js";

const LIMITATIONS: readonly Limitation[] = [
  {
    limitationId: toKebabId("argv-runtime-variance"),
    area: "execution",
    statement:
      "Argv contracts are validated syntactically only; runtime flags and argument forwarding can vary slightly across tool versions.",
    mitigation: "pin exact tool versions and smoke-test templates per environment.",
  },
  {
    limitationId: toKebabId("binary-availability"),
    area: "environment",
    statement:
      "Neither Blender nor FreeCAD is bundled with this package; the presence, path, and version of the binaries are environment facts the host must probe.",
    mitigation:
      "probe the binary with the descriptor's versionProbeArgv before planning invocations.",
  },
  {
    limitationId: toKebabId("cannot-verify-execution"),
    area: "provenance",
    statement:
      "This package never executes anything; ProvenanceRecords are host-recorded claims and cannot cryptographically prove that a tool ran.",
    mitigation:
      "hosts record the tool's stdout status line and artifact digests alongside provenance.",
  },
  {
    limitationId: toKebabId("exit-code-blender"),
    area: "execution",
    statement:
      "Blender exits 0 after uncaught Python script errors unless --python-exit-code is passed; the contract template includes --python-exit-code 1 for this reason.",
    mitigation: "never remove the flag from Blender argv templates.",
  },
  {
    limitationId: toKebabId("exit-code-freecad"),
    area: "execution",
    statement:
      "FreeCADCmd can exit 0 even when a script fails unless the script explicitly calls sys.exit with a non-zero code.",
    mitigation: "treat the stdout JSON status line as the primary success signal.",
  },
  {
    limitationId: toKebabId("fidelity-claims-advisory"),
    area: "fidelity",
    statement:
      "Fidelity flags in exchange records describe observed behavior of one tool version; they are advisory claims, not guarantees.",
    mitigation: "pin tool versions in descriptors and keep per-version exchange records.",
  },
  {
    limitationId: toKebabId("format-support-varies"),
    area: "fidelity",
    statement:
      "Importer and exporter availability and quality vary across tool versions, build options, and add-ons (for example IfcOpenShell presence for IFC).",
    mitigation:
      "record requiresAddon support entries and validate exchange records per tool version.",
  },
  {
    limitationId: toKebabId("no-license-advice"),
    area: "licensing",
    statement:
      "LicenseRecords are engineering summaries of upstream licenses, not legal advice; copyleft conclusions for distribution require counsel.",
    mitigation: "consult counsel before distributing works that combine with Blender or FreeCAD.",
  },
  {
    limitationId: toKebabId("no-network-no-fs"),
    area: "execution",
    statement:
      "This package performs no I/O of its own: no process spawning, no filesystem writes, no network access; sandbox constraints are declarative and require host enforcement.",
    mitigation: "hosts enforce sandbox constraints at spawn time.",
  },
  {
    limitationId: toKebabId("not-a-geometry-authority"),
    area: "semantics",
    statement:
      "Geometry semantics are owned by the OCCT package (W011) and the world model (W000); exchange records reference them by digest and never re-define geometry meaning.",
    mitigation: "always attach semantic authority references to exchange records.",
  },
];

export function buildLimitationsReport(recordedAtUtc: string): LimitationsReport {
  return {
    kind: "limitations-report",
    reportId: toKebabId("blender-freecad-adapter-limitations"),
    packageName: "@zcode/epoch-foundation-blender",
    recordedAtUtc: toUtcTimestamp(recordedAtUtc),
    limitations: LIMITATIONS,
    notLegalAdvice: true,
    honestyNotes: [
      "this report is part of the package contract; it is regenerated identically from the fixed catalog above",
      "the recordedAtUtc timestamp is an input, never generated here",
    ],
  };
}

export function limitationsReportDigest(report: LimitationsReport): Digest {
  return sha256Canonical(report);
}
