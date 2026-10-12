import type { Digest, EntityDigest, Result } from "../types/shared.js";
import type { MeasureKind } from "../types/quantity.js";
import { UNIT_FOR_MEASURE_KIND } from "../types/quantity.js";
import {
  isDigest,
  isKebabId,
  isMeasureKind,
  isNonEmptyString,
  isNonNegativeFiniteNumber,
  isNonNegativeInteger,
  isUnitOfMeasure,
  ok,
  reject,
} from "../validate.js";
import type {
  InspectorProjectionInput,
  InspectorProjectionRejection,
  InspectorView,
  MeasurementAnnotation,
  PropertyPanel,
  PropertyPanelField,
  RawPropertyPanelField,
} from "../types/inspector.js";

type InspectorResult = Result<InspectorView, InspectorProjectionRejection>;

/**
 * Deterministic machine deriving the per-entity InspectorView read-model.
 * Pure: no clock, no randomness, no IO. Every input is validated and every
 * rejection is typed.
 */
export function deriveInspectorView(input: InspectorProjectionInput): InspectorResult {
  if (!isKebabId(input.viewId)) {
    return reject({ kind: "invalid-view-id", viewId: input.viewId });
  }
  if (!isDigest(input.entityDigest)) {
    return reject({ kind: "invalid-entity-digest", entityDigest: input.entityDigest });
  }
  if (!isNonNegativeInteger(input.revision)) {
    return reject({ kind: "invalid-revision", revision: input.revision });
  }
  if (input.derivedFrom.length === 0) {
    return reject({ kind: "empty-derived-from" });
  }
  const derivedFrom: Digest[] = [];
  for (const [index, rawDigest] of input.derivedFrom.entries()) {
    if (!isDigest(rawDigest)) {
      return reject({ kind: "invalid-derived-from", index, digest: rawDigest });
    }
    derivedFrom.push(rawDigest);
  }

  const panelIds = new Set<string>();
  const panels: PropertyPanel[] = [];
  for (const [index, rawPanel] of input.panels.entries()) {
    if (!isKebabId(rawPanel.panelId)) {
      return reject({
        kind: "invalid-panel",
        index,
        reason: `panelId is not a kebab id: ${rawPanel.panelId}`,
      });
    }
    if (panelIds.has(rawPanel.panelId)) {
      return reject({ kind: "duplicate-panel-id", panelId: rawPanel.panelId });
    }
    panelIds.add(rawPanel.panelId);
    if (!isNonEmptyString(rawPanel.title)) {
      return reject({
        kind: "invalid-panel",
        index,
        reason: "panel title must be a non-empty string",
      });
    }
    const fields: PropertyPanelField[] = [];
    for (const rawField of rawPanel.fields) {
      const field = deriveField(rawField);
      if (typeof field === "string") {
        return reject({ kind: "invalid-panel", index, reason: field });
      }
      fields.push(field);
    }
    panels.push({ panelId: rawPanel.panelId, title: rawPanel.title, fields });
  }

  const annotationIds = new Set<string>();
  const measurements: MeasurementAnnotation[] = [];
  for (const [index, rawMeasurement] of input.measurements.entries()) {
    if (!isKebabId(rawMeasurement.annotationId)) {
      return reject({
        kind: "invalid-measurement",
        index,
        reason: `annotationId is not a kebab id: ${rawMeasurement.annotationId}`,
      });
    }
    if (annotationIds.has(rawMeasurement.annotationId)) {
      return reject({ kind: "duplicate-annotation-id", annotationId: rawMeasurement.annotationId });
    }
    annotationIds.add(rawMeasurement.annotationId);
    if (!isMeasureKind(rawMeasurement.measureKind)) {
      return reject({
        kind: "invalid-measurement",
        index,
        reason: `measureKind is not declared: ${String(rawMeasurement.measureKind)}`,
      });
    }
    if (!isNonNegativeFiniteNumber(rawMeasurement.value)) {
      return reject({
        kind: "invalid-measurement",
        index,
        reason: "value must be finite and non-negative",
      });
    }
    if (!isKebabId(rawMeasurement.takeoffId)) {
      return reject({
        kind: "invalid-measurement",
        index,
        reason: `takeoffId is not a kebab id: ${rawMeasurement.takeoffId}`,
      });
    }
    if (rawMeasurement.note !== undefined && !isNonEmptyString(rawMeasurement.note)) {
      return reject({
        kind: "invalid-measurement",
        index,
        reason: "note must be a non-empty string when present",
      });
    }
    const measureKind: MeasureKind = rawMeasurement.measureKind;
    measurements.push({
      annotationId: rawMeasurement.annotationId,
      measureKind,
      value: rawMeasurement.value,
      unit: UNIT_FOR_MEASURE_KIND[measureKind],
      takeoffId: rawMeasurement.takeoffId,
      note: rawMeasurement.note,
    });
  }

  return ok({
    viewId: input.viewId,
    entityDigest: input.entityDigest as unknown as EntityDigest,
    revision: input.revision,
    panels,
    measurements,
    derivedFrom,
  });
}

function deriveField(raw: RawPropertyPanelField): PropertyPanelField | string {
  if (!isNonEmptyString(raw.label)) {
    return `field label must be a non-empty string: ${String(raw.label)}`;
  }
  switch (raw.kind) {
    case "text":
      if (!isNonEmptyString(raw.value)) {
        return "text field value must be a non-empty string";
      }
      return { kind: "text", label: raw.label, value: raw.value };
    case "number":
      if (!isNonNegativeFiniteNumber(raw.value)) {
        return "number field value must be finite and non-negative";
      }
      if (raw.unit !== undefined && !isUnitOfMeasure(raw.unit)) {
        return `number field unit is not declared: ${raw.unit}`;
      }
      return { kind: "number", label: raw.label, value: raw.value, unit: raw.unit };
    case "enum":
      if (raw.options.length === 0) {
        return "enum field requires at least one option";
      }
      if (!raw.options.every(isNonEmptyString)) {
        return "enum field options must be non-empty strings";
      }
      if (!raw.options.includes(raw.value)) {
        return `enum field value is not among the options: ${raw.value}`;
      }
      return { kind: "enum", label: raw.label, value: raw.value, options: [...raw.options] };
    case "digest-ref":
      if (!isNonEmptyString(raw.refKind)) {
        return "digest-ref field refKind must be a non-empty string";
      }
      if (!isDigest(raw.ref)) {
        return `digest-ref field ref is not a digest: ${raw.ref}`;
      }
      return { kind: "digest-ref", label: raw.label, ref: raw.ref, refKind: raw.refKind };
    default: {
      const exhaustive: never = raw;
      throw new Error(`unreachable panel field kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
