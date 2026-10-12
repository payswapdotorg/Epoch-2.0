import type { EntityDigest, Result } from "../types/shared.js";
import type { BoqLineItem } from "../types/boq.js";
import type { ConstraintRecord } from "../types/constraint.js";
import type {
  FindingRecord,
  LinkIndex,
  LinkIndexInput,
  LinkResolutionRejection,
} from "../types/finding.js";
import type { QuantityTakeoff } from "../types/quantity.js";
import { ok, reject } from "../validate.js";

type LinkResult = Result<LinkIndex, LinkResolutionRejection>;

/**
 * Deterministic machine deriving the bidirectional link index: per canonical
 * entity digest, every view / takeoff / constraint / BOQ item / finding id
 * that references it. Dangling and cross-entity references are rejected.
 * The index is derived on demand and never persisted — no duplicate ledger.
 */
export function buildLinkIndex(input: LinkIndexInput): LinkResult {
  const viewIds = new Set<string>();
  for (const view of input.inspectorViews) {
    if (viewIds.has(view.viewId)) {
      return reject({ kind: "duplicate-view-id", viewId: view.viewId });
    }
    viewIds.add(view.viewId);
  }
  const takeoffById = new Map<string, QuantityTakeoff>();
  for (const takeoff of input.takeoffs) {
    if (takeoffById.has(takeoff.takeoffId)) {
      return reject({ kind: "duplicate-takeoff-id", takeoffId: takeoff.takeoffId });
    }
    takeoffById.set(takeoff.takeoffId, takeoff);
  }
  const constraintById = new Map<string, ConstraintRecord>();
  for (const constraint of input.constraints) {
    if (constraintById.has(constraint.constraintId)) {
      return reject({ kind: "duplicate-constraint-id", constraintId: constraint.constraintId });
    }
    constraintById.set(constraint.constraintId, constraint);
  }
  const boqItemById = new Map<string, BoqLineItem>();
  for (const item of input.boqItems) {
    if (boqItemById.has(item.itemId)) {
      return reject({ kind: "duplicate-boq-item-id", itemId: item.itemId });
    }
    boqItemById.set(item.itemId, item);
  }
  const findingById = new Map<string, FindingRecord>();
  for (const finding of input.findings) {
    if (findingById.has(finding.findingId)) {
      return reject({ kind: "duplicate-finding-id", findingId: finding.findingId });
    }
    findingById.set(finding.findingId, finding);
  }

  for (const view of input.inspectorViews) {
    for (const measurement of view.measurements) {
      const takeoff = takeoffById.get(measurement.takeoffId);
      if (takeoff === undefined) {
        return reject({
          kind: "dangling-takeoff-ref",
          viewId: view.viewId,
          takeoffId: measurement.takeoffId,
        });
      }
      if (takeoff.entityDigest !== view.entityDigest) {
        return reject({
          kind: "cross-entity-takeoff-ref",
          viewId: view.viewId,
          takeoffId: measurement.takeoffId,
          entityDigest: view.entityDigest,
        });
      }
    }
  }
  for (const finding of input.findings) {
    for (const constraintId of finding.constraintRefs) {
      const constraint = constraintById.get(constraintId);
      if (constraint === undefined) {
        return reject({
          kind: "dangling-constraint-ref",
          findingId: finding.findingId,
          constraintId,
        });
      }
      if (constraint.entityDigest !== finding.entityDigest) {
        return reject({
          kind: "cross-entity-constraint-ref",
          findingId: finding.findingId,
          constraintId,
          entityDigest: finding.entityDigest,
        });
      }
    }
    for (const itemId of finding.boqItemRefs) {
      const item = boqItemById.get(itemId);
      if (item === undefined) {
        return reject({ kind: "dangling-boq-item-ref", findingId: finding.findingId, itemId });
      }
      if (item.entityDigest !== finding.entityDigest) {
        return reject({
          kind: "cross-entity-boq-item-ref",
          findingId: finding.findingId,
          itemId,
          entityDigest: finding.entityDigest,
        });
      }
    }
  }

  const entitySet = new Set<string>();
  for (const view of input.inspectorViews) {
    entitySet.add(view.entityDigest);
  }
  for (const takeoff of input.takeoffs) {
    entitySet.add(takeoff.entityDigest);
  }
  for (const constraint of input.constraints) {
    entitySet.add(constraint.entityDigest);
  }
  for (const item of input.boqItems) {
    entitySet.add(item.entityDigest);
  }
  for (const finding of input.findings) {
    entitySet.add(finding.entityDigest);
  }

  const byEntity = [...entitySet].sort().map((entityDigest) => ({
    entityDigest: entityDigest as EntityDigest,
    inspectorViewIds: input.inspectorViews
      .filter((view) => view.entityDigest === entityDigest)
      .map((view) => view.viewId)
      .sort(),
    takeoffIds: input.takeoffs
      .filter((takeoff) => takeoff.entityDigest === entityDigest)
      .map((takeoff) => takeoff.takeoffId)
      .sort(),
    constraintIds: input.constraints
      .filter((constraint) => constraint.entityDigest === entityDigest)
      .map((constraint) => constraint.constraintId)
      .sort(),
    boqItemIds: input.boqItems
      .filter((item) => item.entityDigest === entityDigest)
      .map((item) => item.itemId)
      .sort(),
    findingIds: input.findings
      .filter((finding) => finding.entityDigest === entityDigest)
      .map((finding) => finding.findingId)
      .sort(),
  }));
  return ok({ byEntity });
}
