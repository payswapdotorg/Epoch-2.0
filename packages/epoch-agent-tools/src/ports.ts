/**
 * W024 — Agent Tools: the port slices consumed by the dispatcher.
 *
 * Each interface below is a STRUCTURAL slice of a frozen upstream contract.
 * The dispatcher accepts any object satisfying the slice — the concrete port
 * binds directly (or via a zero-cost adapter) at integration:
 *
 * - `AgentSolutionSurfacePort` — slice of the W003 Solution Surface port
 *   (engine-agnostic solution operations); see
 *   packages/epoch-solution-surface/src/index.ts.
 * - `AgentInteractionPort` — slice of the W007 typed interaction command
 *   surface (selection, navigation, isolation, measurement, annotation,
 *   state read); see packages/epoch-world-interaction/src/index.ts.
 * - `AgentWorldStorePort` — slice of the W021 WorldStore port used for the
 *   append-only command audit log; see packages/epoch-persistence.
 *
 * The slices are presentation-free by construction: no method exposes a
 * renderer object, and the dispatcher never touches presentation state.
 */
import type { AgentCommandAuditRecord } from './audit.js';
import type {
  IsolationMode,
  NavigationOptions,
  NavigationTarget,
  SelectionMode,
  SolutionAnnotateParams,
  SolutionMeasureParams,
} from './commands.js';
import type {
  AgentAnnotationReport,
  AgentElementReport,
  AgentInteractionState,
  AgentMeasurementReport,
  AgentSolutionInfo,
  AgentViewpoint,
} from './values.js';

/** Structural slice of the W003 Solution Surface port (data plane). */
export interface AgentSolutionSurfacePort {
  openSolution(request: {
    readonly solutionId: string;
    readonly revision?: string;
    readonly readOnly?: boolean;
  }): Promise<AgentSolutionInfo>;

  inspectSolution(request: {
    readonly elementIds: readonly string[];
    readonly includeProperties: boolean;
    readonly includeRelations: boolean;
  }): Promise<{ readonly elements: readonly AgentElementReport[] }>;

  simulateSolution(request: {
    readonly scenarioId: string;
    readonly inputs: Readonly<Record<string, string | number | boolean>>;
  }): Promise<{
    readonly scenarioId: string;
    readonly metrics: Readonly<Record<string, number>>;
    readonly summary?: string;
  }>;
}

/** Structural slice of the W007 interaction command surface (interaction plane). */
export interface AgentInteractionPort {
  applySelection(command: {
    readonly mode: SelectionMode;
    readonly elementIds: readonly string[];
  }): Promise<{ readonly selectedElementIds: readonly string[]; readonly changed: boolean }>;

  applyNavigation(command: {
    readonly target: NavigationTarget;
    readonly options?: NavigationOptions;
  }): Promise<{ readonly viewpoint: AgentViewpoint; readonly applied: boolean }>;

  applyIsolation(command: {
    readonly mode: IsolationMode;
    readonly elementIds: readonly string[];
  }): Promise<{ readonly isolatedElementIds: readonly string[]; readonly changed: boolean }>;

  measure(request: SolutionMeasureParams): Promise<AgentMeasurementReport>;

  applyAnnotation(command: SolutionAnnotateParams): Promise<AgentAnnotationReport>;

  getInteractionState(): Promise<AgentInteractionState>;
}

/**
 * Structural slice of the W021 WorldStore port used for the command audit
 * log: append-only records keyed by digest. Implementations must reject
 * overwrites of an existing digest (append-only law); the dispatcher itself
 * guarantees idempotent appends by checking for the digest first.
 */
export interface AgentWorldStorePort {
  appendCommandRecord(record: AgentCommandAuditRecord): Promise<void>;
  getCommandRecord(digest: string): Promise<AgentCommandAuditRecord | undefined>;
  listCommandRecords(filter?: { readonly sessionId?: string }): Promise<AgentCommandAuditRecord[]>;
}
