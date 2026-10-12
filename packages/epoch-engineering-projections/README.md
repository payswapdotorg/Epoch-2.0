# @zcode/epoch-engineering-projections

W019 — Inspector / BOQ / constraints — a derived-projection package for the
Epoch-2.0 monorepo. It links semantic entity identity (canonical world-model
digests) bidirectionally with inspector read-models, quantity takeoffs, bills
of quantities, constraints and inspection findings.

**This package has no execution authority and no second semantic authority.**
World-model semantics are referenced by typed data + digest refs only; entity
records are never re-defined here.

## Package laws (EPOCH-2.0 merged-package conventions)

- `@zcode/epoch-engineering-projections`, private, ESM (`"type": "module"`),
  `main`/`types` → `./dist/src/index.js` / `./dist/src/index.d.ts`,
  `exports: { ".": types + default }`, `files: [dist, src]`.
- `tsconfig.json`: ES2022, NodeNext, strict (+ `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, …), composite/incremental, `outDir dist`,
  `rootDir "."`, `tsBuildInfoFile dist/.tsbuildinfo`.
- `src/canonical.ts`: canonical JSON (recursively key-sorted, no whitespace)
  and sha-256 helpers via `node:crypto` — SHA-256 is never hand-rolled;
  digests are lowercase hex.
- `src/contract.ts`: `CONTRACT_NAME`, `CONTRACT_REVISION`, typed
  `CONTRACT_LAWS`, `PUBLIC_CONTRACT` entries and `assertPublicContract` /
  `publicContractNames` / `runtimeContractNames`.
- `src/validate.ts`: shared validators (`isKebabId`, `isNonEmptyString`,
  `isNonNegativeInteger`, …).
- `src/types/*.ts`: branded types; one domain area per file.
- `src/build/*.ts`: deterministic machines — pure functions; timestamps are
  inputs, never generated.
- `src/module.ts`: `MODULE_NAME` + `MODULE_ARTIFACTS` manifest + digest.
- `src/index.ts`: public barrel exporting exactly the runtime names of
  `contract.ts` (asserted by `test/contract.test.ts`).

## Domain tour

### Inspector read-model
`deriveInspectorView` builds an `InspectorView` per canonical entity digest:
typed property panels (text / number / enum / digest-ref fields), measurement
annotations (unit derived from the measure kind, each pointing at the quantity
takeoff record that measured it) and provenance (`derivedFrom` world-model
record digests). Everything is derived — nothing about the entity is
re-defined here.

### Quantities law
`buildQuantityTakeoff` records a `QuantityTakeoff`: an EXPLICIT takeoff method
(`centerline-length`, `boundary-area`, `footprint-area`, `solid-volume`,
`unit-count`, `schedule-mass`, `duration-time` — mapped to measure kinds by
the typed law `TAKEOFF_METHOD_MEASURE_KIND`) plus an explicit measurement
basis (geometry digest / parametric record digest / manual survey). Methods
are never implied. Exactly one canonical unit exists per measure kind
(`UNIT_FOR_MEASURE_KIND`: m, m2, m3, count, kg, h).

### BOQ
`compileBoq` compiles a `BoqDocument` under typed grouping (`by-section` /
`by-entity`) and rollup (`document-total` / `per-group-totals`) laws.
`BoqLineItem`s are keyed to canonical entity digests; quantities are
cross-checked against the referenced takeoff records (no duplicate quantity
ledger); cost references point to EXTERNAL price sources by digest, with
integer minor units and a currency. Rollups sum within one currency and one
measure kind only — exact unrounded sums, no conversion, no rounding policy.

### Constraints
`buildConstraint` binds typed constraints — clearance (length), capacity (any
measure kind), code references (records only) — to entity digests.
`validateConstraints` evaluates bounds against all matching takeoffs and
returns typed verdicts: `pass` / `fail` / `not-evaluable` (no matching takeoff,
or a code reference, which is a record only).

### Findings and the bidirectional link graph
`buildFinding` records severity + evidence digests; the status lifecycle is
DATA (`FINDING_STATUS_TRANSITIONS`) and `advanceFindingStatus` enforces it.
`buildLinkIndex` derives the reverse index — per canonical entity digest:
view ids, takeoff ids, constraint ids, BOQ item ids, finding ids — and rejects
dangling or cross-entity references. The index is derived on demand and never
persisted: no duplicate ledger anywhere.

### Limitations
`buildLimitationsReport` returns the honest limitations record (see below).

## Honest limitations

- **No pricing data.** Cost references point to external price sources by
  digest. No currency conversion, no rounding policy: rollups are exact
  single-currency sums of quantity × unit price.
- **No scheduling.** Nothing in this package models dates, durations or
  sequences beyond input timestamps.
- **Code-compliance checking is out of scope.** Code-reference constraints
  are records only and always evaluate to `not-evaluable`.
- **Quantity values are recorded inputs.** This package does not run geometry
  kernels; takeoff values arrive with an explicit method and basis and are
  validated, not computed.
- **No execution authority.** No process spawning, filesystem writes or
  network access; machines are pure and deterministic.
- **No persistence.** Projections (inspector views, BOQ documents, link
  indexes) are rebuilt deterministically on demand.

## Example
