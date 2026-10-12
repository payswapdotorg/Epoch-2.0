# @zcode/epoch-asset-import

Assimp-backed generic asset import **normalization** for the Epoch-2.0 monorepo:
typed data + deterministic machines. **No execution authority** — the host runs
Assimp; this package models its documented import surface, gates fidelity, and
normalizes imports into provenance-linked manifests.

## Role (work order W016)

1. **Format capability matrix** — the Assimp format surface (OBJ, FBX, glTF 2.0,
   GLB, STL, Collada, PLY, 3DS, X, OFF) as data: `ImportFormatDescriptor` with
   extensions, feature support (meshes / materials / skeletons / animations /
   PBR) and a fidelity class per format.
2. **Import manifests** — `ImportManifest`: source asset identity (byte digest,
   format, size), declared target representation, and a provenance chain
   (source digest → normalized record digests).
3. **Lossy-conversion law** — `applyFidelityGate` deterministically accepts or
   rejects with typed reasons: `unsupported-feature-loss`,
   `material-fidelity-loss`, `topology-loss`, `animation-loss` (plus
   `undeclared-fidelity`: rejection is the DEFAULT for undeclared fidelity).
4. **Normalization machines** — `normalizeImportManifest`, `summarizeImport`,
   `validateNormalizedAsset` (typed rejections).
5. **Provenance preservation** — every normalized record carries the source
   digest chain; orphan records are typed validation failures, never dropped.
6. **LimitationsReport** — honest: no Assimp binary here (the host runs it),
   the matrix reflects Assimp's documented surface (not runtime behavior),
   compressed/encrypted archives are out of scope.

## Package laws

- Pure, deterministic machines; timestamps (`generatedAt`) are inputs, never
  generated.
- Digests via `node:crypto` SHA-256 over canonical JSON (sorted keys, no
  whitespace), lowercase hex.
- No process spawning, no filesystem writes, no network.
- Sibling packages are referenced by typed data + digest refs only — never
  re-defined, never imported across their seams.
- Public surface is exactly the runtime names declared in `src/contract.ts`
  (asserted by `test/contract.test.ts`).

## Build / test
