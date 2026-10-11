/**
 * READ-ONLY, TYPE-ONLY seams to the frozen Epoch contracts (invariants 1, 4, 17).
 *
 * ⚠️ INTEGRATION NOTE (W011 executor): I could not read the frozen contracts in
 * this session. VERIFY before running gates:
 *   1. exact workspace package names (packages/epoch-world-model/package.json,
 *      packages/epoch-reconstruction-contract/package.json) and update the two
 *      import specifiers + package.json deps if they differ;
 *   2. whether kernel descriptors should map onto the reconstruction-engine
 *      registry convention — the alias below is the intended mapping point.
 *
 * These imports are erased at runtime (verbatim type-only): this package never
 * calls into the world model; it only conforms to its shapes. That is the whole
 * point of the no-second-authority boundary.
 */
import type { ReconstructionEngineDescriptor } from '@zcode/epoch-reconstruction-contract';
import type { WorldEntity } from '@zcode/epoch-world-model';
import type { GeometryPresentationData } from './world-bridge.ts';

/** What a host/world-model integration passes to projectToWorldEntity to build the real entity. */
export type WorldEntityProjectionTarget = WorldEntity;
export type GeometryPresentationEntityFactory = (data: GeometryPresentationData) => WorldEntity;
/** Mapping point if geometry kernels register through the reconstruction-engine descriptor/registry convention. */
export type GeometryKernelRegistryDescriptor = ReconstructionEngineDescriptor;
