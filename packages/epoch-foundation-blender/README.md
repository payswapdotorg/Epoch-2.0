# @zcode/epoch-foundation-blender

Typed-data capability adapters for **Blender** (bpy headless) and **FreeCAD**
(console mode) in the Epoch-2.0 workbench. This package is W013 of the
foundation series.

**Status: descriptive data only.** This package never spawns processes, never
writes files, never opens sockets. It describes how a HOST may invoke Blender
and FreeCAD, validates host-authored invocation plans against those
descriptions, and records licenses, provenance, exchange fidelity, and
limitations — all as typed, digest-stable data.

## What is inside

| Area                                     | Where              |
| ---------------------------------------- | ------------------ |
| Canonical JSON + SHA-256 digests         | `src/canonical.ts` |
| Public contract, laws, surface assertion | `src/contract.ts`  |
| Shared guards / checked constructors     | `src/validate.ts`  |
| Branded + domain types                   | `src/types/*.ts`   |
| Builders and validation machines         | `src/build/*.ts`   |
| Module manifest + digest                 | `src/module.ts`    |
| Public barrel                            | `src/index.ts`     |

- `NativeToolDescriptor` — one per adapter (`blender-bpy-headless`,
  `freecad-console`), pinned to one tool semver: binary/argv shape, supported
  I/O formats, exit-code contract.
- `InvocationContract` — typed argv template, stdin protocol, stdout/stderr
  capture shape, timeout policy, sandbox constraints. Bound to its descriptor
  by digest. `InvocationPlan` is the host-authored request;
  `validateInvocationPlan` accepts (resolving the argv as data) or rejects
  with a typed reason (`unknown-tool`, `unsupported-input-format`,
  `license-mismatch`, `sandbox-violation`, …).
- `LicenseRecord` — Blender `GPL-3.0-or-later` (strong copyleft), FreeCAD
  `LGPL-2.1-or-later` (weak copyleft), recorded per tool version, with honest
  distribution and process-boundary notes. **Not legal advice.**
  `ProvenanceRecord` binds tool+version to produced artifacts by digest.
- `GeometryExchangeRecord` — what may cross the process boundary, with
  fidelity flags. This package is **not** a geometry semantic authority:
  exchange records reference the OCCT package (W011) and the world model
  (W000) by digest only.
- `summarizeCapabilityMatrix` — deterministic tool/format coverage summary.
- `LimitationsReport` — the honest catalog of what this package cannot do.

## Usage sketch
