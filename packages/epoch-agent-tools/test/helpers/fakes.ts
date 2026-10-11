/**
 * W024 — Agent Tools: provider-neutral in-memory fakes for the three port
 * slices consumed by the dispatcher (solution surface, interaction commands,
 * WorldStore audit). These fakes implement the SAME structural slices as the
 * frozen upstream ports, so the tests are provider-neutral by construction.
 */
import type {
  AgentInteractionPort,
  AgentSolutionSurfacePort,
  AgentWorldStorePort,
} from '../../src/ports.js';
import type { AgentCommandAuditRecord } from '../../src/audit.js';
import type {
  AgentAnnotationReport,
  AgentElementReport,
  AgentInteractionState,
  AgentMeasurementReport,
  AgentSolutionInfo,
  AgentViewpoint,
} from '../../src/values.js';

export interface FakeSolution {
  readonly solutionId: string;
  readonly revision: string;
  readonly title?: string;
  readonly elementIds: readonly string[];
  readonly scenarios: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface FakeSurfaceOptions {
  readonly solutions?: readonly FakeSolution[];
  readonly failOpenFor?: readonly string[];
}

export class FakeSolutionSurface implements AgentSolutionSurfacePort {
  readonly calls: Array<{ readonly method: string; readonly request: unknown }> = [];
  private readonly solutions: Map<string, FakeSolution>;
  private readonly failOpenFor: Set<string>;

  constructor(options: FakeSurfaceOptions = {}) {
    this.solutions = new Map((options.solutions ?? []).map((solution) => [solution.solutionId, solution]));
    this.failOpenFor = new Set(options.failOpenFor ?? []);
  }

  async openSolution(request: {
    readonly solutionId: string;
    readonly revision?: string;
    readonly readOnly?: boolean;
  }): Promise<AgentSolutionInfo> {
    this.calls.push({ method: 'openSolution', request });
    const solution = this.solutions.get(request.solutionId);
    if (solution === undefined || this.failOpenFor.has(request.solutionId)) {
      throw new Error(`unknown solution: ${request.solutionId}`);
    }
    return {
      solutionId: solution.solutionId,
      revision: request.revision ?? solution.revision,
      elementCount: solution.elementIds.length,
      title: solution.title,
      schemaVersion: '1.0.0',
    };
  }

  async inspectSolution(request: {
    readonly elementIds: readonly string[];
    readonly includeProperties: boolean;
    readonly includeRelations: boolean;
  }): Promise<{ readonly elements: readonly AgentElementReport[] }> {
    this.calls.push({ method: 'inspectSolution', request });
    const elements: AgentElementReport[] = request.elementIds.map((elementId, index) => ({
      elementId,
      type: 'wall',
      name: `Element ${index + 1}`,
      properties: request.includeProperties ? { height: 3.2, material: 'concrete' } : undefined,
      relations: request.includeRelations
        ? [{ elementId: request.elementIds[(index + 1) % request.elementIds.length], relation: 'connected-to' }]
        : undefined,
    }));
    return { elements };
  }

  async simulateSolution(request: {
    readonly scenarioId: string;
    readonly inputs: Readonly<Record<string, string | number | boolean>>;
  }): Promise<{
    readonly scenarioId: string;
    readonly metrics: Readonly<Record<string, number>>;
    readonly summary?: string;
  }> {
    this.calls.push({ method: 'simulateSolution', request });
    const metrics = this.solutions.get('sol-1')?.scenarios[request.scenarioId];
    if (metrics === undefined) {
      throw new Error(`unknown scenario: ${request.scenarioId}`);
    }
    const scaled: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics)) {
      const input = request.inputs['factor'];
      const factor = typeof input === 'number' ? input : 1;
      scaled[key] = value * factor;
    }
    return { scenarioId: request.scenarioId, metrics: scaled, summary: `simulated ${request.scenarioId}` };
  }
}

export class FakeInteraction implements AgentInteractionPort {
  readonly calls: Array<{ readonly method: string; readonly request: unknown }> = [];
  private selected: string[] = [];
  private isolated: string[] = [];
  private annotations: Array<{ id: string; text: string; elementId?: string }> = [];
  private viewpoint: AgentViewpoint = { target: [0, 0, 0], direction: [1, 0, 0], distance: 10 };

  async applySelection(command: {
    readonly mode: 'replace' | 'add' | 'remove' | 'clear';
    readonly elementIds: readonly string[];
  }): Promise<{ readonly selectedElementIds: readonly string[]; readonly changed: boolean }> {
    this.calls.push({ method: 'applySelection', request: command });
    const before = this.selected.length;
    switch (command.mode) {
      case 'replace':
        this.selected = [...command.elementIds];
        break;
      case 'add':
        for (const id of command.elementIds) {
          if (!this.selected.includes(id)) {
            this.selected.push(id);
          }
        }
        break;
      case 'remove':
        this.selected = this.selected.filter((id) => !command.elementIds.includes(id));
        break;
      case 'clear':
        this.selected = [];
        break;
    }
    return { selectedElementIds: [...this.selected], changed: before !== this.selected.length };
  }

  async applyNavigation(command: {
    readonly target:
      | { readonly kind: 'elements'; readonly elementIds: readonly string[] }
      | { readonly kind: 'point'; readonly point: readonly [number, number, number] }
      | { readonly kind: 'home' };
    readonly options?: { readonly fit?: boolean; readonly direction?: readonly [number, number, number] };
  }): Promise<{ readonly viewpoint: AgentViewpoint; readonly applied: boolean }> {
    this.calls.push({ method: 'applyNavigation', request: command });
    if (command.target.kind === 'point') {
      this.viewpoint = { ...this.viewpoint, target: command.target.point };
    } else if (command.target.kind === 'elements') {
      this.viewpoint = { ...this.viewpoint, target: [1, 2, 3] };
    } else {
      this.viewpoint = { target: [0, 0, 0], direction: [1, 0, 0], distance: 10 };
    }
    if (command.options?.direction !== undefined) {
      this.viewpoint = { ...this.viewpoint, direction: command.options.direction };
    }
    return { viewpoint: this.viewpoint, applied: true };
  }

  async applyIsolation(command: {
    readonly mode: 'isolate' | 'show-all';
    readonly elementIds: readonly string[];
  }): Promise<{ readonly isolatedElementIds: readonly string[]; readonly changed: boolean }> {
    this.calls.push({ method: 'applyIsolation', request: command });
    const before = this.isolated.length;
    this.isolated = command.mode === 'isolate' ? [...command.elementIds] : [];
    return { isolatedElementIds: [...this.isolated], changed: before !== this.isolated.length };
  }

  async measure(request: {
    readonly kind: 'distance';
    readonly from: { readonly kind: 'point'; readonly point: readonly [number, number, number] } | { readonly kind: 'element'; readonly elementId: string; readonly anchor?: 'origin' | 'center' };
    readonly to: { readonly kind: 'point'; readonly point: readonly [number, number, number] } | { readonly kind: 'element'; readonly elementId: string; readonly anchor?: 'origin' | 'center' };
  } | { readonly kind: 'clear' }): Promise<AgentMeasurementReport> {
    this.calls.push({ method: 'measure', request });
    if (request.kind === 'clear') {
      return { kind: 'clear', clearedMeasurements: 1 };
    }
    const from = request.from.kind === 'point' ? request.from.point : [0, 0, 0];
    const to = request.to.kind === 'point' ? request.to.point : [3, 4, 0];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    return { kind: 'distance', distance: Math.sqrt(dx * dx + dy * dy + dz * dz) };
  }

  async applyAnnotation(command:
    | {
        readonly action: 'add';
        readonly annotationId: string;
        readonly text: string;
        readonly elementId?: string;
        readonly anchor?: readonly [number, number, number];
      }
    | { readonly action: 'remove'; readonly annotationId: string }): Promise<AgentAnnotationReport> {
    this.calls.push({ method: 'applyAnnotation', request: command });
    if (command.action === 'add') {
      const snapshot = {
        annotationId: command.annotationId,
        elementId: command.elementId,
        anchor: command.anchor,
        text: command.text,
      };
      this.annotations = this.annotations.filter((a) => a.id !== command.annotationId).concat([
        { id: command.annotationId, text: command.text, elementId: command.elementId },
      ]);
      return { action: 'add', annotation: snapshot };
    }
    this.annotations = this.annotations.filter((a) => a.id !== command.annotationId);
    return { action: 'remove', annotationId: command.annotationId };
  }

  async getInteractionState(): Promise<AgentInteractionState> {
    this.calls.push({ method: 'getInteractionState', request: undefined });
    return {
      selectedElementIds: [...this.selected],
      isolatedElementIds: [...this.isolated],
      annotations: this.annotations.map((a) => ({
        annotationId: a.id,
        elementId: a.elementId,
        text: a.text,
      })),
      viewpoint: this.viewpoint,
    };
  }
}

/** In-memory WorldStore audit-slice adapter (W021 port shape). */
export class InMemoryWorldStore implements AgentWorldStorePort {
  readonly appends: AgentCommandAuditRecord[] = [];
  private readonly records = new Map<string, AgentCommandAuditRecord>();

  async appendCommandRecord(record: AgentCommandAuditRecord): Promise<void> {
    const existing = this.records.get(record.digest);
    if (existing !== undefined) {
      throw new Error(`digest already recorded: ${record.digest}`);
    }
    this.records.set(record.digest, record);
    this.appends.push(record);
  }

  async getCommandRecord(digest: string): Promise<AgentCommandAuditRecord | undefined> {
    return this.records.get(digest);
  }

  async listCommandRecords(filter?: { readonly sessionId?: string }): Promise<AgentCommandAuditRecord[]> {
    const all = [...this.records.values()];
    if (filter?.sessionId === undefined) {
      return all;
    }
    return all.filter((record) => record.sessionId === filter.sessionId);
  }
}

export const DEFAULT_SOLUTIONS: readonly FakeSolution[] = [
  {
    solutionId: 'sol-1',
    revision: 'rev-1',
    title: 'Test Solution',
    elementIds: ['el-1', 'el-2', 'el-3'],
    scenarios: { daylight: { illuminance: 500 } },
  },
];
