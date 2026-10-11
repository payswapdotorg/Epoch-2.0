import { contentDigest } from './canonical.ts';
import { booleanIntersect, booleanSubtract, booleanUnion } from './booleans.ts';
import type { BRepShape, BRepSolid, GeometryKernelDescriptor, GeometryOperation, GeometryResult, ShapeRef, Vec3 } from './contracts.ts';
import { InvalidGeometryError, UnknownShapeError, UnsupportedOperationError } from './errors.ts';
import { matMul, matTranslate, rotationFromZTo } from './linear.ts';
import { boxPairDistance, distanceToPoint, shapeArea, shapeBounds, shapeContains, shapeVolume } from './queries.ts';
import { buildBox, buildCylinder, buildFrustum, buildPrism, buildSphere, buildTorus, transformShape, transformSolid } from './shapes.ts';

/** The provider-neutral port. Any kernel (analytic, test, future OCCT/WASM) implements exactly this. */
export interface GeometryKernel {
  describe(): GeometryKernelDescriptor;
  execute(op: GeometryOperation): GeometryResult;
}

export const ANALYTIC_KERNEL_DESCRIPTOR: GeometryKernelDescriptor = {
  id: 'epoch-geometry-analytic',
  version: '0.1.0',
  capabilities: {
    primitives: {
      box: 'analytic', cylinder: 'analytic', cone: 'analytic', sphere: 'analytic',
      torus: 'analytic', prism: 'analytic', extrude: 'analytic',
    },
    booleans: { union: 'analytic', subtract: 'analytic', intersect: 'analytic' },
    transform: 'analytic',
    queries: { volume: 'analytic', area: 'analytic', bounds: 'analytic', distance: 'analytic', contains: 'analytic' },
    freeform: { fillet: 'unsupported', chamfer: 'unsupported', nurbs: 'unsupported', offset: 'unsupported', loft: 'unsupported' },
  },
  notes: [
    'Analytic adapter: exact closed-form primitives, transforms and queries. Arbitrary placement is an exact rigid-transform wrapper (rotation entries canonicalized to 12 significant digits, the documented canonical epsilon).',
    'Booleans are exact but restricted to axis-aligned box operands (translated/uniformly-scaled box wrappers accepted); exact slab-grid decomposition. All other operand kinds throw UnsupportedOperationError.',
    'distance shape-to-shape is restricted to axis-aligned box pairs; point-to-shape distance is exact for every supported solid kind.',
    'prism/extrude accept convex polygonal profiles only (validated; non-convex throws).',
    'transform supports rigid transforms plus uniform scale; non-uniform scaling is unsupported (curved analytic surfaces would degenerate to non-representable surfaces).',
    'No fillets, chamfers, offsets, lofts, NURBS or freeform booleans: a real OCCT kernel plugs into the same GeometryKernel port later without touching the world model, renderers or hosts.',
    'Determinism: shapes are content-addressed; canonical serialization (sorted keys, 12-significant-digit rounding, no timestamps, content-derived ids) makes identical op inputs produce byte-identical serializations and digests.',
    'Topology is construction-oriented: full-circle edges are periodic without explicit seam-vertex binding; queries use exact analytic definitions, not mesh approximations.',
  ],
};

export function createAnalyticKernel(): GeometryKernel {
  const shapes = new Map<string, BRepShape>();
  const register = (shape: BRepShape): GeometryResult => {
    const digest = contentDigest(shape);
    shapes.set(digest, shape);
    return { digest, shape, tolerance: 0, capability: 'analytic' };
  };
  const resolve = (ref: ShapeRef, opName: string): BRepShape => {
    const s = shapes.get(ref);
    if (s === undefined) throw new UnknownShapeError(`${ref} (referenced by '${opName}')`);
    return s;
  };
  const placed = (solid: BRepSolid, origin: Vec3, axis: Vec3): BRepSolid => {
    const atOrigin = origin[0] === 0 && origin[1] === 0 && origin[2] === 0;
    const isZ = axis[0] === 0 && axis[1] === 0 && axis[2] === 1;
    if (atOrigin && isZ) return solid;
    const m = matMul(matTranslate(origin), isZ ? rotationFromZTo([0, 0, 1]) : rotationFromZTo(axis));
    return transformSolid(solid, m, 1);
  };
  const query = (opName: string, ref: ShapeRef, value: GeometryResult['value']): GeometryResult => {
    resolve(ref, opName); // validates the reference
    return { digest: ref, value, tolerance: 0, capability: 'analytic' };
  };
  return {
    describe: () => ANALYTIC_KERNEL_DESCRIPTOR,
    execute: (op: GeometryOperation): GeometryResult => {
      switch (op.op) {
        case 'box':
          return register(buildBox(op.min, op.max));
        case 'cylinder':
          return register(placed(buildCylinder(op.radius, op.height), op.origin, op.axis));
        case 'cone':
          return register(placed(buildFrustum(op.radiusBottom, op.radiusTop, op.height), op.origin, op.axis));
        case 'sphere':
          return register(placed(buildSphere(op.radius), op.origin, [0, 0, 1]));
        case 'torus':
          return register(placed(buildTorus(op.majorRadius, op.minorRadius), op.origin, op.axis));
        case 'prism':
          return register(buildPrism(op.base, op.height));
        case 'extrude': {
          const base = buildPrism(op.profile, op.distance);
          const isZ = op.axis[0] === 0 && op.axis[1] === 0 && op.axis[2] === 1;
          return register(isZ ? base : transformSolid(base, rotationFromZTo(op.axis), 1));
        }
        case 'union':
          return register(booleanUnion(resolve(op.operands[0], 'union'), resolve(op.operands[1], 'union')));
        case 'subtract':
          return register(booleanSubtract(resolve(op.operands[0], 'subtract'), resolve(op.operands[1], 'subtract')));
        case 'intersect':
          return register(booleanIntersect(resolve(op.operands[0], 'intersect'), resolve(op.operands[1], 'intersect')));
        case 'transform':
          return register(transformShape(resolve(op.shape, 'transform'), op.transform));
        case 'volume':
          return query('volume', op.shape, shapeVolume(resolve(op.shape, 'volume')));
        case 'area':
          return query('area', op.shape, shapeArea(resolve(op.shape, 'area')));
        case 'bounds':
          return query('bounds', op.shape, shapeBounds(resolve(op.shape, 'bounds')));
        case 'distance': {
          const shape = resolve(op.shape, 'distance');
          if (op.point !== undefined) return query('distance', op.shape, distanceToPoint(shape, op.point));
          if (op.other !== undefined) return query('distance', op.shape, boxPairDistance(shape, resolve(op.other, 'distance')));
          throw new InvalidGeometryError("distance requires either 'point' (exact, all solid kinds) or 'other' (box pairs only)");
        }
        case 'contains':
          return query('contains', op.shape, shapeContains(resolve(op.shape, 'contains'), op.point));
        default: {
          const unknown = (op as { op?: string }).op ?? '<missing>';
          throw new UnsupportedOperationError(unknown,
            'not part of the bounded W011 operation set (no fillets/chamfers/offsets/lofts/NURBS/freeform booleans)');
        }
      }
    },
  };
}

/**
 * In-memory test kernel: a deliberately INDEPENDENT minimal implementation
 * (box + translate + volume/bounds/contains only, honestly declared) that
 * proves the GeometryKernel port is swappable without touching consumers.
 */
export function createInMemoryTestKernel(): GeometryKernel {
  const boxes = new Map<string, { min: Vec3; max: Vec3 }>();
  const TEST_DESCRIPTOR: GeometryKernelDescriptor = {
    id: 'epoch-geometry-test-kernel',
    version: '0.1.0',
    capabilities: {
      primitives: { box: 'analytic', cylinder: 'unsupported', cone: 'unsupported', sphere: 'unsupported', torus: 'unsupported', prism: 'unsupported', extrude: 'unsupported' },
      booleans: { union: 'unsupported', subtract: 'unsupported', intersect: 'unsupported' },
      transform: 'analytic',
      queries: { volume: 'analytic', area: 'unsupported', bounds: 'analytic', distance: 'unsupported', contains: 'analytic' },
      freeform: { fillet: 'unsupported', chamfer: 'unsupported', nurbs: 'unsupported', offset: 'unsupported', loft: 'unsupported' },
    },
    notes: ['Minimal independent kernel proving port swappability; translation-only transforms; supports box primitives and volume/bounds/contains queries.'],
  };
  const solidOf = (b: { min: Vec3; max: Vec3 }): BRepSolid => ({
    kind: 'solid', faces: [], edges: [], vertices: [],
    definition: { kind: 'box', min: b.min, max: b.max },
  });
  const register = (b: { min: Vec3; max: Vec3 }): GeometryResult => {
    const digest = contentDigest({ testKernel: 'box', box: b });
    boxes.set(digest, b);
    return { digest, shape: solidOf(b), tolerance: 0, capability: 'analytic' };
  };
  return {
    describe: () => TEST_DESCRIPTOR,
    execute: (op: GeometryOperation): GeometryResult => {
      switch (op.op) {
        case 'box': {
          for (let i = 0; i < 3; i++) {
            if (!(op.max[i] > op.min[i])) throw new InvalidGeometryError('test kernel: box extent must be positive');
          }
          return register({ min: [...op.min] as Vec3, max: [...op.max] as Vec3 });
        }
        case 'transform': {
          if (op.transform.rotate !== undefined || op.transform.uniformScale !== undefined) {
            throw new UnsupportedOperationError('transform', 'test kernel supports translation only');
          }
          const b = boxes.get(op.shape);
          if (b === undefined) throw new UnknownShapeError(op.shape);
          const t = op.transform.translate ?? [0, 0, 0];
          return register({
            min: [b.min[0] + t[0], b.min[1] + t[1], b.min[2] + t[2]],
            max: [b.max[0] + t[0], b.max[1] + t[1], b.max[2] + t[2]],
          });
        }
        case 'volume': {
          const b = boxes.get(op.shape);
          if (b === undefined) throw new UnknownShapeError(op.shape);
          return { digest: op.shape, value: (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]), tolerance: 0, capability: 'analytic' };
        }
        case 'bounds': {
          const b = boxes.get(op.shape);
          if (b === undefined) throw new UnknownShapeError(op.shape);
          return { digest: op.shape, value: [b.min, b.max] as const, tolerance: 0, capability: 'analytic' };
        }
        case 'contains': {
          const b = boxes.get(op.shape);
          if (b === undefined) throw new UnknownShapeError(op.shape);
          const inside = op.point[0] >= b.min[0] && op.point[0] <= b.max[0]
            && op.point[1] >= b.min[1] && op.point[1] <= b.max[1]
            && op.point[2] >= b.min[2] && op.point[2] <= b.max[2];
          return { digest: op.shape, value: inside, tolerance: 0, capability: 'analytic' };
        }
        default:
          throw new UnsupportedOperationError(op.op, 'not supported by the in-memory test kernel');
      }
    },
  };
}
