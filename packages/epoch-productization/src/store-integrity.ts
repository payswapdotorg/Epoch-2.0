import {
  canonicalJson,
  compareStrings,
  isHex64,
  sha256Hex,
} from "./canonical.js";

/**
 * Read-only integrity sweep over a durable WorldStore.
 *
 * The WorldStorePort below is the minimal STRUCTURAL read surface this
 * adapter requires. It is satisfied structurally (this package does not
 * import @zcode/epoch-persistence): any WorldStore exposing these five
 * read operations can be swept. Because the port declares only read
 * operations, the sweep cannot mutate the store — read-only is a
 * property of the TYPE, not a convention.
 *
 * Checks (deterministic, content-derived):
 * - digest re-computation: declared digests are recomputed from the
 *   canonical form (sha256 via node:crypto) and compared;
 * - key mismatch: an entry whose content carries a string `id` must be
 *   filed under that exact key;
 * - orphans: a record whose content references a `worldId` that is not
 *   stored, or a `parentId` that is not a record of the same world;
 * - listing hygiene: duplicate and empty keys are reported as warnings.
 *
 * Entries without a declared digest skip digest verification (the store
 * decides whether it declares digests).
 */

export interface WorldStorePort {
  listWorlds(): readonly string[];
  listRecords(worldId: string): readonly string[];
  readWorld(worldId: string): unknown;
  readRecord(worldId: string, recordId: string): unknown;
  declaredDigest(worldId: string, recordId: string | null): string | null;
}

export type StoreIntegrityFindingCode =
  | "world-listing-duplicate"
  | "world-id-empty"
  | "world-unreadable"
  | "world-content-noncanonical"
  | "world-digest-malformed"
  | "world-digest-mismatch"
  | "world-key-mismatch"
  | "record-listing-duplicate"
  | "record-id-empty"
  | "record-unreadable"
  | "record-content-noncanonical"
  | "record-digest-malformed"
  | "record-digest-mismatch"
  | "record-key-mismatch"
  | "record-world-mismatch"
  | "record-orphan-world"
  | "record-orphan-parent";

export type StoreIntegritySeverity = "error" | "warning";

export interface StoreIntegrityFinding {
  readonly code: StoreIntegrityFindingCode;
  readonly severity: StoreIntegritySeverity;
  readonly worldId: string | null;
  readonly recordId: string | null;
  readonly message: string;
  readonly declaredDigest: string | null;
  readonly computedDigest: string | null;
}

export interface StoreFindingTotal {
  readonly code: StoreIntegrityFindingCode;
  readonly count: number;
}

export interface StoreIntegrityReport {
  readonly kind: "store-integrity-report";
  readonly worldsChecked: number;
  readonly recordsChecked: number;
  readonly digestChecks: number;
  readonly findings: readonly StoreIntegrityFinding[];
  readonly findingTotals: readonly StoreFindingTotal[];
  readonly reportDigest: string;
}

const SEVERITY: Record<StoreIntegrityFindingCode, StoreIntegritySeverity> = {
  "world-listing-duplicate": "warning",
  "world-id-empty": "warning",
  "world-unreadable": "error",
  "world-content-noncanonical": "error",
  "world-digest-malformed": "error",
  "world-digest-mismatch": "error",
  "world-key-mismatch": "error",
  "record-listing-duplicate": "warning",
  "record-id-empty": "warning",
  "record-unreadable": "error",
  "record-content-noncanonical": "error",
  "record-digest-malformed": "error",
  "record-digest-mismatch": "error",
  "record-key-mismatch": "error",
  "record-world-mismatch": "error",
  "record-orphan-world": "error",
  "record-orphan-parent": "error",
};

export function verifyStoreIntegrity(store: WorldStorePort): StoreIntegrityReport {
  const findings: StoreIntegrityFinding[] = [];
  let digestChecks = 0;

  const worldIds = new Set<string>();
  for (const worldId of store.listWorlds()) {
    if (worldId === "") {
      findings.push(finding("world-id-empty", null, null, "world id is empty", null, null));
      continue;
    }
    if (worldIds.has(worldId)) {
      findings.push(
        finding(
          "world-listing-duplicate",
          worldId,
          null,
          `world ${worldId} is listed more than once`,
          null,
          null,
        ),
      );
    } else {
      worldIds.add(worldId);
    }
  }

  let recordsChecked = 0;
  const sortedWorldIds = [...worldIds].sort(compareStrings);
  for (const worldId of sortedWorldIds) {
    checkEntry(store, worldId, null, worldId, "world", findings, () => {
      digestChecks += 1;
    });

    const recordIds = new Set<string>();
    for (const recordId of store.listRecords(worldId)) {
      if (recordId === "") {
        findings.push(
          finding(
            "record-id-empty",
            worldId,
            null,
            `record id is empty in world ${worldId}`,
            null,
            null,
          ),
        );
        continue;
      }
      if (recordIds.has(recordId)) {
        findings.push(
          finding(
            "record-listing-duplicate",
            worldId,
            recordId,
            `record ${recordId} is listed more than once in world ${worldId}`,
            null,
            null,
          ),
        );
      } else {
        recordIds.add(recordId);
      }
    }
    for (const recordId of [...recordIds].sort(compareStrings)) {
      recordsChecked += 1;
      checkEntry(store, worldId, recordId, recordId, "record", findings, () => {
        digestChecks += 1;
      });
      const value = store.readRecord(worldId, recordId);
      if (isPlainRecord(value)) {
        checkRecordReferences(value, worldId, recordId, worldIds, recordIds, findings);
      }
    }
  }

  findings.sort(compareFindings);
  const skeleton = {
    kind: "store-integrity-report" as const,
    worldsChecked: sortedWorldIds.length,
    recordsChecked,
    digestChecks,
    findings: Object.freeze(findings.map((item) => Object.freeze(item))),
    findingTotals: Object.freeze(totals(findings)),
  };
  const reportDigest = sha256Hex(canonicalJson(skeleton));
  return Object.freeze({ ...skeleton, reportDigest });
}

function checkEntry(
  store: WorldStorePort,
  worldId: string,
  recordId: string | null,
  key: string,
  prefix: "world" | "record",
  findings: StoreIntegrityFinding[],
  onDigestCheck: () => void,
): void {
  const value =
    recordId === null ? store.readWorld(worldId) : store.readRecord(worldId, recordId);
  if (value === null || value === undefined) {
    findings.push(
      finding(
        `${prefix}-unreadable`,
        worldId,
        recordId,
        `${prefix} ${key} is listed but reads as null/undefined`,
        null,
        null,
      ),
    );
    return;
  }
  let canonical: string | null = null;
  try {
    canonical = canonicalJson(value);
  } catch {
    canonical = null;
  }
  if (canonical === null) {
    findings.push(
      finding(
        `${prefix}-content-noncanonical`,
        worldId,
        recordId,
        `${prefix} ${key} content is not a canonicalizable JSON value`,
        null,
        null,
      ),
    );
    return;
  }
  const declared = store.declaredDigest(worldId, recordId);
  if (declared !== null) {
    if (!isHex64(declared)) {
      findings.push(
        finding(
          `${prefix}-digest-malformed`,
          worldId,
          recordId,
          `declared digest for ${prefix} ${key} is not 64 lowercase hex characters`,
          declared,
          null,
        ),
      );
    } else {
      onDigestCheck();
      const computed = sha256Hex(canonical);
      if (computed !== declared) {
        findings.push(
          finding(
            `${prefix}-digest-mismatch`,
            worldId,
            recordId,
            `digest mismatch for ${prefix} ${key}: canonical content hashes differently than declared`,
            declared,
            computed,
          ),
        );
      }
    }
  }
  if (isPlainRecord(value)) {
    const contentId = value["id"];
    if (typeof contentId === "string" && contentId !== key) {
      findings.push(
        finding(
          `${prefix}-key-mismatch`,
          worldId,
          recordId,
          `content id ${contentId} does not match storage key ${key}`,
          null,
          null,
        ),
      );
    }
  }
}

function checkRecordReferences(
  value: Record<string, unknown>,
  worldId: string,
  recordId: string,
  worldIds: ReadonlySet<string>,
  recordIds: ReadonlySet<string>,
  findings: StoreIntegrityFinding[],
): void {
  const reference = value["worldId"];
  if (typeof reference === "string" && reference !== worldId) {
    const code: StoreIntegrityFindingCode = worldIds.has(reference)
      ? "record-world-mismatch"
      : "record-orphan-world";
    findings.push(
      finding(
        code,
        worldId,
        recordId,
        `record content references worldId ${reference} while filed under ${worldId}`,
        null,
        null,
      ),
    );
  }
  const parent = value["parentId"];
  if (typeof parent === "string" && parent !== "" && !recordIds.has(parent)) {
    findings.push(
      finding(
        "record-orphan-parent",
        worldId,
        recordId,
        `record content references parentId ${parent} which is not a record of world ${worldId}`,
        null,
        null,
      ),
    );
  }
}

function finding(
  code: StoreIntegrityFindingCode,
  worldId: string | null,
  recordId: string | null,
  message: string,
  declaredDigest: string | null,
  computedDigest: string | null,
): StoreIntegrityFinding {
  return Object.freeze({
    code,
    severity: SEVERITY[code],
    worldId,
    recordId,
    message,
    declaredDigest,
    computedDigest,
  });
}

function compareFindings(
  left: StoreIntegrityFinding,
  right: StoreIntegrityFinding,
): number {
  const byCode = compareStrings(left.code, right.code);
  if (byCode !== 0) {
    return byCode;
  }
  const byWorld = compareStrings(left.worldId ?? "", right.worldId ?? "");
  if (byWorld !== 0) {
    return byWorld;
  }
  const byRecord = compareStrings(left.recordId ?? "", right.recordId ?? "");
  if (byRecord !== 0) {
    return byRecord;
  }
  return compareStrings(left.message, right.message);
}

function totals(
  findings: readonly StoreIntegrityFinding[],
): readonly StoreFindingTotal[] {
  const counts = new Map<StoreIntegrityFindingCode, number>();
  for (const item of findings) {
    counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => compareStrings(left[0], right[0]))
    .map(([code, count]) => Object.freeze({ code, count }));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return (value.constructor?.name ?? "Object") === "Object";
}
