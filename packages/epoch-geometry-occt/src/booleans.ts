import type { BRepShape, BRepSolid, Vec3 } from './contracts.ts';
import { UnsupportedOperationError } from './errors.ts';
import { applyPoint, isScaledIdentityRotation } from './linear.ts';
import { buildBox } from './shapes.ts';

/**
 * Exact axis-aligned-box booleans via slab (grid) decomposition.
 * Restriction is HONEST: operands must resolve to axis-aligned boxes
 * (plain boxes, or translated/uniformly-scaled box wrappers — rotation part
 * must be s*I exactly). Anything else throws UnsupportedOperationError.
 * Complexity is O(n^3) in distinct slab coordinates — fine for adapter-scale use.
 */
type Box = { min: Vec3; max: Vec3 };

function boxOfSolid(solid: BRepSolid): Box | null {
  const def = solid.definition;
  if (def.kind === 'box') return { min: def.min, max: def.max };
  if (def.kind === 'transformed' && def.base.kind === 'box') {
    if (!isScaledIdentityRotation(def.matrix, def.uniformScale)) return null;
    return { min: applyPoint(def.matrix, def.base.min), max: applyPoint(def.matrix, def.base.max) };
  }
  return null;
}

export function flattenBoxes(opName: string, shape: BRepShape): Box[] {
  const solids = shape.kind === 'compound' ? shape.solids : [shape];
  const boxes: Box[] = [];
  for (const s of solids) {
    const b = boxOfSolid(s);
    if (b === null) {
      throw new UnsupportedOperationError(opName,
        `operand is not an axis-aligned box (solid definition kind '${s.definition.kind}'); box-only booleans are the honest scope of the analytic adapter`);
    }
    boxes.push(b);
  }
  return boxes;
}

function containsBox(outer: Box, inner: Box): boolean {
  return outer.min[0] <= inner.min[0] && inner.max[0] <= outer.max[0]
    && outer.min[1] <= inner.min[1] && inner.max[1] <= outer.max[1]
    && outer.min[2] <= inner.min[2] && inner.max[2] <= outer.max[2];
}

function coveredBy(cell: Box, boxes: readonly Box[]): boolean {
  return boxes.some((b) => containsBox(b, cell));
}

function slabCoords(boxes: readonly Box[], axis: 0 | 1 | 2): number[] {
  const vals: number[] = [];
  for (const b of boxes) { vals.push(b.min[axis], b.max[axis]); }
  vals.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of vals) if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  return out;
}

function compoundOf(boxes: readonly Box[]): BRepShape {
  return { kind: 'compound', solids: boxes.map((b) => buildBox(b.min, b.max)) };
}

function gridCells(boxes: readonly Box[]): Box[] {
  const xs = slabCoords(boxes, 0);
  const ys = slabCoords(boxes, 1);
  const zs = slabCoords(boxes, 2);
  const cells: Box[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      for (let k = 0; k + 1 < zs.length; k++) {
        const min: Vec3 = [xs[i], ys[j], zs[k]];
        const max: Vec3 = [xs[i + 1], ys[j + 1], zs[k + 1]];
        const cell: Box = { min, max };
        if (coveredBy(cell, boxes)) cells.push(cell);
      }
    }
  }
  return cells;
}

export function booleanUnion(a: BRepShape, b: BRepShape): BRepShape {
  const boxes = [...flattenBoxes('union', a), ...flattenBoxes('union', b)];
  return compoundOf(gridCells(boxes));
}

export function booleanSubtract(a: BRepShape, b: BRepShape): BRepShape {
  const A = flattenBoxes('subtract', a);
  const B = flattenBoxes('subtract', b);
  return compoundOf(gridCells([...A, ...B]).filter((c) => coveredBy(c, A) && !coveredBy(c, B)));
}

export function booleanIntersect(a: BRepShape, b: BRepShape): BRepShape {
  const A = flattenBoxes('intersect', a);
  const B = flattenBoxes('intersect', b);
  const out: Box[] = [];
  for (const x of A) {
    for (const y of B) {
      const min: Vec3 = [Math.max(x.min[0], y.min[0]), Math.max(x.min[1], y.min[1]), Math.max(x.min[2], y.min[2])];
      const max: Vec3 = [Math.min(x.max[0], y.max[0]), Math.min(x.max[1], y.max[1]), Math.min(x.max[2], y.max[2])];
      if (min[0] < max[0] && min[1] < max[1] && min[2] < max[2]) out.push({ min, max });
    }
  }
  return compoundOf(out);
}
