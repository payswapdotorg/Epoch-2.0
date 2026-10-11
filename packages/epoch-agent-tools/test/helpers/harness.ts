/**
 * W024 — Agent Tools: shared test harness wiring the dispatcher to the
 * provider-neutral fakes and minting authorization tokens.
 */
import { AgentToolDispatcher } from '../../src/dispatcher.js';
import type { AgentAuthorization } from '../../src/authorization.js';
import { AGENT_COMMAND_KINDS } from '../../src/kinds.js';
import type { AgentCommandKind, AgentScope } from '../../src/kinds.js';
import { DEFAULT_SOLUTIONS, FakeInteraction, FakeSolutionSurface, InMemoryWorldStore } from './fakes.js';

export interface Harness {
  readonly dispatcher: AgentToolDispatcher;
  readonly surface: FakeSolutionSurface;
  readonly interaction: FakeInteraction;
  readonly worldStore: InMemoryWorldStore;
}

export function createHarness(): Harness {
  const surface = new FakeSolutionSurface({ solutions: DEFAULT_SOLUTIONS });
  const interaction = new FakeInteraction();
  const worldStore = new InMemoryWorldStore();
  const dispatcher = new AgentToolDispatcher({ surface, interaction, worldStore });
  return { dispatcher, surface, interaction, worldStore };
}

export function fullAuthorization(
  tokenId = 'token-1',
  subject = 'agent-1',
  overrides: Partial<Pick<AgentAuthorization, 'allowedCommands' | 'scopes' | 'boundSessions'>> = {},
): AgentAuthorization {
  return {
    tokenId,
    subject,
    allowedCommands: overrides.allowedCommands ?? [...AGENT_COMMAND_KINDS],
    scopes: overrides.scopes ?? (['solution.read', 'solution.interact', 'solution.annotate', 'solution.simulate'] as AgentScope[]),
    boundSessions: overrides.boundSessions,
  };
}

export function command(
  kind: AgentCommandKind,
  sessionId = 'session-1',
  tokenId = 'token-1',
  correlationId?: string,
): {
  readonly kind: AgentCommandKind;
  readonly sessionId: string;
  readonly authorization: { readonly tokenId: string };
  readonly provenance: { readonly agentId: string; readonly tool?: string; readonly reason?: string; readonly correlationId?: string };
  readonly params: Record<string, unknown>;
} {
  return {
    kind,
    sessionId,
    authorization: { tokenId },
    provenance: { agentId: 'agent-1', tool: 'w024-test', reason: 'unit test', correlationId },
    params: paramsFor(kind, correlationId),
  };
}

export function paramsFor(kind: AgentCommandKind, correlationId?: string): Record<string, unknown> {
  const suffix = correlationId === undefined ? '' : `-${correlationId}`;
  switch (kind) {
    case 'solution.open':
      return { solutionId: 'sol-1', revision: 'rev-1' };
    case 'solution.select':
      return { mode: 'replace', elementIds: ['el-1'] };
    case 'solution.inspect':
      return { elementIds: ['el-1', 'el-2'], includeProperties: true, includeRelations: true };
    case 'solution.navigate':
      return { target: { kind: 'elements', elementIds: ['el-1'] }, options: { fit: true } };
    case 'solution.isolate':
      return { mode: 'isolate', elementIds: ['el-1'] };
    case 'solution.measure':
      return { kind: 'distance', from: { kind: 'point', point: [0, 0, 0] }, to: { kind: 'point', point: [3, 4, 0] } };
    case 'solution.annotate':
      return { action: 'add', annotationId: `note-1${suffix}`, text: 'check this' };
    case 'solution.simulate':
      return { scenarioId: 'daylight', inputs: { factor: 2 } };
    case 'solution.observe':
      return { includeInteractionState: true };
  }
}

export async function openSession(harness: Harness, sessionId = 'session-1'): Promise<void> {
  harness.dispatcher.createSession(sessionId);
  await harness.dispatcher.dispatch(
    command('solution.open', sessionId) as never,
    fullAuthorization(),
  );
}
