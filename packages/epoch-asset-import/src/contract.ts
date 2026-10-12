import { PUBLIC_CONTRACT } from "./contract-entries.js";

export const CONTRACT_NAME = "epoch-asset-import";
export const CONTRACT_REVISION = 1;

export type ContractLaw = {
  readonly lawId: string;
  readonly statement: string;
};

export const CONTRACT_LAWS: readonly ContractLaw[] = [
  {
    lawId: "no-execution-authority",
    statement:
      "This package spawns no processes, writes no filesystem paths and opens no network sockets. Assimp itself is executed by the host; this package only models its documented import surface as typed data and deterministic machines.",
  },
  {
    lawId: "typed-data-only",
    statement:
      "Every artifact is typed data plus a deterministic machine. No behavior escapes the package boundary except pure functions over their inputs.",
  },
  {
    lawId: "digest-provenance",
    statement:
      "Every normalized record is linked to its source asset digest through a provenance chain. Orphan records (missing or mismatched provenance) are typed validation failures, never silently dropped.",
  },
  {
    lawId: "fidelity-gate-default-reject",
    statement:
      "Rejection is the default: an import without an explicit fidelity declaration is rejected as undeclared-fidelity. Lossy conversion whose losses cannot be represented is rejected with a typed reason.",
  },
  {
    lawId: "deterministic-machines",
    statement:
      "All machines are pure and deterministic. Timestamps are inputs (generatedAt), never generated inside the package. Identical inputs produce deeply equal outputs and identical digests.",
  },
  {
    lawId: "no-second-semantic-authority",
    statement:
      "Sibling packages (world model, IFC, glTF, OpenUSD, ...) own their record semantics. This package references them by typed data and digest only and never re-defines their records.",
  },
  {
    lawId: "honest-limitations",
    statement:
      "The LimitationsReport states plainly: no Assimp binary ships here, the format matrix reflects Assimp's documented surface rather than runtime behavior, and compressed or encrypted archives are out of scope.",
  },
];

// The public-surface entry types and the PUBLIC_CONTRACT array live in
// ./contract-entries.ts (split out under the max-contract-lines law) and are
// re-exported here so every existing import path keeps working unchanged.
// The dependency is strictly one-directional: contract.ts -> contract-entries.ts.
export type { PublicContractEntryKind, PublicContractEntry } from "./contract-entries.js";
export { PUBLIC_CONTRACT };

export function publicContractNames(): string[] {
  return PUBLIC_CONTRACT.map((entry) => entry.name);
}

export function runtimeContractNames(): string[] {
  return PUBLIC_CONTRACT.filter((entry) => entry.kind !== "type").map((entry) => entry.name);
}

export function assertPublicContract(actual: readonly string[]): void {
  const expected = runtimeContractNames();
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  const missing = expectedSorted.filter((name) => !actualSorted.includes(name));
  const extra = actualSorted.filter((name) => !expectedSorted.includes(name));
  if (missing.length > 0 || extra.length > 0 || actualSorted.length !== expectedSorted.length) {
    throw new Error(
      `public contract mismatch:\n  missing: ${missing.join(", ") || "(none)"}\n  extra: ${extra.join(", ") || "(none)"}`,
    );
  }
}
