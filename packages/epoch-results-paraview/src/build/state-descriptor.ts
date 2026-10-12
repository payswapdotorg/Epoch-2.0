import { canonicalDigest } from "../canonical.js";
import type { CanonicalJsonValue } from "../canonical.js";
import type { Sha256Hex } from "../types/branded.js";
import type {
  ParaViewStateDescriptor,
  ParaViewStateRejection,
  ParaViewStateValidation,
  Vector3,
} from "../types/paraview.js";
import {
  PARAVIEW_COLOR_MAPS,
  PARAVIEW_FILTER_KINDS,
  PARAVIEW_REPRESENTATIONS,
} from "../types/paraview.js";
import { validateParaViewPluginRef } from "./plugin-ref.js";
import {
  isDigestRef,
  isFiniteNumber,
  isKebabId,
  isMemberOf,
  isNonEmptyString,
  isNonEmptyStringArray,
  isPositiveInteger,
  isRecord,
} from "../validate.js";

const GLYPH_SHAPES = ["arrow", "sphere", "cone"] as const;
const INTEGRATION_DIRECTIONS = ["forward", "backward", "both"] as const;
const RANGE_MODES = ["automatic", "manual"] as const;

function isVector3(value: unknown): value is Vector3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => isFiniteNumber(component))
  );
}

function isNonZeroVector(vector: Vector3): boolean {
  return vector.some((component) => component !== 0);
}

function requireFilterField(
  raw: Record<string, unknown>,
  key: "vectorFieldName" | "fieldName",
  label: string,
  index: number,
  rejections: ParaViewStateRejection[],
): void {
  if (!isKebabId(raw[key])) {
    rejections.push({
      kind: "invalid-filter-field",
      index,
      message: `filter ${label} ${key} must be a kebab-id`,
    });
  }
}

/** Validates an untrusted ParaView state descriptor with typed rejections. */
export function validateStateDescriptor(input: unknown): ParaViewStateValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      rejections: [
        {
          kind: "invalid-schema-version",
          message: "state descriptor must be a record carrying schemaVersion 1",
        },
      ],
    };
  }
  const rejections: ParaViewStateRejection[] = [];
  if (input.schemaVersion !== 1) {
    rejections.push({
      kind: "invalid-schema-version",
      message: `schemaVersion must be 1 (got ${JSON.stringify(input.schemaVersion)})`,
    });
  }
  if (!isKebabId(input.id)) {
    rejections.push({
      kind: "invalid-id",
      message: "id must be a kebab-id (e.g. cfd-slice-state)",
    });
  }
  if (!isNonEmptyString(input.title)) {
    rejections.push({
      kind: "invalid-title",
      message: "title must be a non-empty string",
    });
  }
  const datasetRefs = input.datasetRefs;
  if (!Array.isArray(datasetRefs) || datasetRefs.length === 0) {
    rejections.push({
      kind: "missing-dataset-refs",
      message: "datasetRefs must reference at least one result dataset by digest",
    });
  } else {
    datasetRefs.forEach((ref, index) => {
      if (!isDigestRef(ref)) {
        rejections.push({
          kind: "invalid-dataset-ref",
          index,
          message: `datasetRefs[${index}] must be {ownerPackage, artifactKind, digest}`,
        });
      }
    });
  }
  if (!isMemberOf(PARAVIEW_REPRESENTATIONS, input.representation)) {
    rejections.push({
      kind: "invalid-representation",
      message: `representation must be one of ${PARAVIEW_REPRESENTATIONS.join(", ")} (got ${JSON.stringify(input.representation)})`,
    });
  }
  validateColorAssignment(input.colorMap, rejections);
  const filters = input.filters;
  if (!Array.isArray(filters)) {
    rejections.push({
      kind: "invalid-filters",
      message: "filters must be an array (possibly empty) of ParaView filter descriptions",
    });
  } else {
    const priorFilterIds = new Set<string>();
    filters.forEach((rawFilter, index) => {
      validateFilter(rawFilter, index, priorFilterIds, rejections);
    });
  }
  const pluginRefs = input.pluginRefs;
  if (pluginRefs !== undefined) {
    if (!Array.isArray(pluginRefs)) {
      rejections.push({
        kind: "invalid-plugin-refs",
        message: "pluginRefs, when present, must be an array of plugin references",
      });
    } else {
      pluginRefs.forEach((rawRef, index) => {
        const result = validateParaViewPluginRef(rawRef);
        if (!result.ok) {
          for (const rejection of result.rejections) {
            rejections.push({
              kind: "invalid-plugin-ref",
              index,
              message: `pluginRefs[${index}]: ${rejection.message}`,
            });
          }
        }
      });
    }
  }
  if (input.notes !== undefined && !isNonEmptyStringArray(input.notes)) {
    rejections.push({
      kind: "invalid-notes",
      message: "notes, when present, must be an array of non-empty strings",
    });
  }
  if (rejections.length > 0) {
    return { ok: false, rejections };
  }
  return { ok: true, value: input as unknown as ParaViewStateDescriptor };
}

/** sha256 over the canonical JSON of a validated state descriptor. */
export function paraViewStateDescriptorDigest(descriptor: ParaViewStateDescriptor): Sha256Hex {
  return canonicalDigest(descriptor as unknown as CanonicalJsonValue);
}

function validateColorAssignment(raw: unknown, rejections: ParaViewStateRejection[]): void {
  if (!isRecord(raw)) {
    rejections.push({
      kind: "invalid-color-assignment",
      message: "colorMap must describe the active field, color map, range mode and opacity",
    });
    return;
  }
  if (!isKebabId(raw.fieldName)) {
    rejections.push({
      kind: "invalid-color-field",
      message: "colorMap.fieldName must be a kebab-id naming a result field",
    });
  }
  if (!isMemberOf(PARAVIEW_COLOR_MAPS, raw.colorMap)) {
    rejections.push({
      kind: "invalid-color-map",
      colorMap: String(raw.colorMap),
      message: `colorMap must be one of ${PARAVIEW_COLOR_MAPS.join(", ")}`,
    });
  }
  if (!isMemberOf(RANGE_MODES, raw.rangeMode)) {
    rejections.push({
      kind: "invalid-range-mode",
      message: 'rangeMode must be "automatic" or "manual"',
    });
  } else if (raw.rangeMode === "manual") {
    const manualRange = raw.manualRange;
    const validRange =
      isRecord(manualRange) &&
      isFiniteNumber(manualRange.min) &&
      isFiniteNumber(manualRange.max) &&
      manualRange.min <= manualRange.max;
    if (!validRange) {
      rejections.push({
        kind: "invalid-color-range",
        message: "manual rangeMode requires manualRange {min, max} with min <= max",
      });
    }
  }
  if (typeof raw.invert !== "boolean") {
    rejections.push({
      kind: "invalid-invert",
      message: "invert must be a boolean",
    });
  }
  const opacity = raw.opacity;
  if (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1) {
    rejections.push({
      kind: "invalid-opacity",
      message: "opacity must be a finite number in [0, 1]",
    });
  }
}

function validateFilter(
  raw: unknown,
  index: number,
  priorFilterIds: Set<string>,
  rejections: ParaViewStateRejection[],
): void {
  if (!isRecord(raw)) {
    rejections.push({
      kind: "invalid-filter",
      index,
      message: `filters[${index}] must be a record`,
    });
    return;
  }
  const filterId = raw.id;
  if (!isKebabId(filterId)) {
    rejections.push({
      kind: "invalid-filter",
      index,
      message: `filters[${index}].id must be a kebab-id`,
    });
  }
  const label = isKebabId(filterId) ? filterId : `#${index}`;
  const appliesTo = raw.appliesTo;
  if (appliesTo !== undefined) {
    if (!isKebabId(appliesTo)) {
      rejections.push({
        kind: "invalid-filter",
        index,
        message: `filters[${index}].appliesTo must be a kebab-id`,
      });
    } else if (!priorFilterIds.has(appliesTo)) {
      rejections.push({
        kind: "unknown-filter-chain",
        index,
        filterId: label,
        appliesTo,
        message: `filter ${label} appliesTo "${appliesTo}" which is not an earlier filter in the chain`,
      });
    }
  }
  if (isKebabId(filterId)) {
    if (priorFilterIds.has(filterId)) {
      rejections.push({
        kind: "duplicate-filter-id",
        filterId,
        message: `filter id "${filterId}" is used more than once`,
      });
    } else {
      priorFilterIds.add(filterId);
    }
  }
  const kind = raw.kind;
  if (kind === "slice" || kind === "clip") {
    if (!isVector3(raw.planeNormal) || !isNonZeroVector(raw.planeNormal)) {
      rejections.push({
        kind: "invalid-plane-normal",
        index,
        message: `filter ${label} planeNormal must be a non-zero finite 3-vector`,
      });
    }
    if (!isVector3(raw.origin)) {
      rejections.push({
        kind: "invalid-origin",
        index,
        message: `filter ${label} origin must be a finite 3-vector`,
      });
    }
    if (kind === "clip" && typeof raw.insideOut !== "boolean") {
      rejections.push({
        kind: "invalid-inside-out",
        index,
        message: `filter ${label} insideOut must be a boolean`,
      });
    }
  } else if (kind === "glyph") {
    requireFilterField(raw, "vectorFieldName", label, index, rejections);
    const scaleFactor = raw.scaleFactor;
    if (!isFiniteNumber(scaleFactor) || scaleFactor <= 0) {
      rejections.push({
        kind: "invalid-glyph-scale",
        index,
        message: `filter ${label} scaleFactor must be a finite number > 0`,
      });
    }
    if (!isMemberOf(GLYPH_SHAPES, raw.glyphShape)) {
      rejections.push({
        kind: "invalid-glyph-shape",
        index,
        message: `filter ${label} glyphShape must be one of ${GLYPH_SHAPES.join(", ")}`,
      });
    }
  } else if (kind === "streamline") {
    requireFilterField(raw, "vectorFieldName", label, index, rejections);
    const seedPoints = raw.seedPoints;
    if (
      !Array.isArray(seedPoints) ||
      seedPoints.length === 0 ||
      !seedPoints.every((point) => isVector3(point))
    ) {
      rejections.push({
        kind: "invalid-seed-points",
        index,
        message: `filter ${label} seedPoints must be a non-empty array of finite 3-vectors`,
      });
    }
    const stepLength = raw.stepLength;
    if (!isFiniteNumber(stepLength) || stepLength <= 0) {
      rejections.push({
        kind: "invalid-step-length",
        index,
        message: `filter ${label} stepLength must be a finite number > 0`,
      });
    }
    if (!isPositiveInteger(raw.maxSteps)) {
      rejections.push({
        kind: "invalid-max-steps",
        index,
        message: `filter ${label} maxSteps must be a positive integer`,
      });
    }
    if (!isMemberOf(INTEGRATION_DIRECTIONS, raw.integrationDirection)) {
      rejections.push({
        kind: "invalid-integration-direction",
        index,
        message: `filter ${label} integrationDirection must be one of ${INTEGRATION_DIRECTIONS.join(", ")}`,
      });
    }
  } else if (kind === "contour") {
    requireFilterField(raw, "fieldName", label, index, rejections);
    const isoValues = raw.isoValues;
    if (!Array.isArray(isoValues) || isoValues.length === 0) {
      rejections.push({
        kind: "empty-iso-values",
        index,
        message: `filter ${label} isoValues must be a non-empty array`,
      });
    } else if (!isoValues.every((value) => isFiniteNumber(value))) {
      rejections.push({
        kind: "invalid-iso-values",
        index,
        message: `filter ${label} isoValues must all be finite numbers`,
      });
    }
  } else if (kind === "threshold") {
    requireFilterField(raw, "fieldName", label, index, rejections);
    const min = raw.min;
    const max = raw.max;
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || min > max) {
      rejections.push({
        kind: "invalid-threshold-range",
        index,
        message: `filter ${label} threshold bounds must be finite numbers with min <= max`,
      });
    }
  } else {
    rejections.push({
      kind: "unknown-filter-kind",
      index,
      kindName: String(kind),
      message: `filter ${label} kind must be one of ${PARAVIEW_FILTER_KINDS.join(", ")}`,
    });
  }
}
