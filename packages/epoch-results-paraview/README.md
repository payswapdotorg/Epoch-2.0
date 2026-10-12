# @zcode/epoch-results-paraview

ParaView result **projection read-models** for EPOCH-2.0 (work order W015).

This package turns scientific/engineering results into typed data plus
deterministic validation machines. It has **no execution authority**: it never
spawns ParaView, never parses VTK files, never writes to the filesystem and
never touches the network. A host that owns execution may feed the descriptors
produced here to ParaView.

## Package laws

- **Projection read-models only.** `ResultDataset` and `ParaViewStateDescriptor`
  are typed data. Nothing here executes a visualization.
- **No silent replacement.** A `ResultProjectionRecord` binds a result dataset
  digest to a world-model entity digest with a declared derivation and the
  structural `authority: "projection-only"` marker. Results never replace
  baseline world state.
- **Digest references only.** Meshes, topologies, world entities and result
  payloads are referenced by `{ownerPackage, artifactKind, digest}`
  (64-char lowercase sha256 hex). Owning packages are never re-defined and
  never imported.
- **Typed rejections.** Every machine returns a discriminated
  `{ ok: true, value } | { ok: false, rejections }` union. No exceptions for
  domain failures.
- **Deterministic machines.** No wall-clock, no randomness, no I/O. Timestamps
  are inputs. Digests are `sha256` over canonical JSON (recursively sorted
  keys, no whitespace) via `node:crypto`.
- **Honest limitations.** External capability limits are recorded in the
  `LimitationsReport` artifact (`buildLimitationsReport()`) and mirrored below.

## Main machines

| Machine | Purpose |
| --- | --- |
| `validateResultDataset` | structural + semantic validation of a result dataset (typed rejections: `unit-mismatch`, `unknown-association`, `empty-field`, …) |
| `resultDatasetDigest` | sha256 digest over the canonical JSON of a dataset |
| `validateStateDescriptor` | validation of a provider-neutral ParaView state descriptor (typed rejections: `invalid-color-map`, `unknown-filter-chain`, …) |
| `paraViewStateDescriptorDigest` / `paraViewPluginRefDigest` | digests for descriptors and plugin provenance refs |
| `buildResultProjectionRecord` / `validateResultProjectionRecord` | build/validate the dataset↔world-entity projection binding (dedupes + sorts derivation input refs) |
| `summarizeProjectionCoverage` | deterministic coverage summary over projection records |
| `buildLimitationsReport` | the honest limitations artifact |

## Usage
