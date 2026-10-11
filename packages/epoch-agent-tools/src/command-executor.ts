/**
 * W024 — Agent Tools: command execution over the ports.
 *
 * `executeAgentCommand` routes a validated command to the Solution Surface
 * slice or the W007 interaction command slice and wraps any non-typed port
 * failure in a typed `AgentPortError`. Extracted from `./dispatcher.js` to
 * keep every module under the architecture line budget; behavior is
 * unchanged. Results are value payloads — never renderer objects.
 */
import { AgentPortError, AgentToolsError } from './errors.js';
import type { AgentPortName } from './errors.js';
import type { AgentCommand, AgentCommandKind } from './contract.js';
import type { AgentInteractionPort, AgentSolutionSurfacePort } from './ports.js';
import type { AgentCommandValue } from './results.js';
import type { AgentSolutionInfo } from './values.js';

const PORT_BY_KIND: Readonly<Record<AgentCommandKind, AgentPortName>> = {
  'solution.open': 'solution-surface',
  'solution.select': 'world-interaction',
  'solution.inspect': 'solution-surface',
  'solution.navigate': 'world-interaction',
  'solution.isolate': 'world-interaction',
  'solution.measure': 'world-interaction',
  'solution.annotate': 'world-interaction',
  'solution.simulate': 'solution-surface',
  'solution.observe': 'world-interaction',
};

export interface AgentCommandExecutionDeps {
  readonly surface: AgentSolutionSurfacePort;
  readonly interaction: AgentInteractionPort;
  readonly openSolution: AgentSolutionInfo | null;
}

/**
 * Executes a validated command through the ports, wrapping non-typed failures
 * in `AgentPortError`. Pure routing — no authorization, no audit and no
 * session mutation happen here.
 */
export async function executeAgentCommand(
  command: AgentCommand,
  deps: AgentCommandExecutionDeps,
): Promise<AgentCommandValue> {
  try {
    return await runCommand(command, deps);
  } catch (error) {
    if (error instanceof AgentToolsError) {
      throw error;
    }
    throw new AgentPortError(PORT_BY_KIND[command.kind], command.kind, error);
  }
}

async function runCommand(
  command: AgentCommand,
  deps: AgentCommandExecutionDeps,
): Promise<AgentCommandValue> {
  switch (command.kind) {
    case 'solution.open': {
      const solution = await deps.surface.openSolution({
        solutionId: command.params.solutionId,
        revision: command.params.revision,
        readOnly: command.params.readOnly,
      });
      return { solution };
    }
    case 'solution.select': {
      const selection = await deps.interaction.applySelection({
        mode: command.params.mode,
        elementIds: command.params.elementIds,
      });
      return { selection };
    }
    case 'solution.inspect': {
      const report = await deps.surface.inspectSolution({
        elementIds: command.params.elementIds,
        includeProperties: command.params.includeProperties === true,
        includeRelations: command.params.includeRelations === true,
      });
      return { elements: report.elements };
    }
    case 'solution.navigate': {
      const navigation = await deps.interaction.applyNavigation({
        target: command.params.target,
        options: command.params.options,
      });
      return { navigation };
    }
    case 'solution.isolate': {
      const isolation = await deps.interaction.applyIsolation({
        mode: command.params.mode,
        elementIds: command.params.elementIds,
      });
      return { isolation };
    }
    case 'solution.measure': {
      const measurement = await deps.interaction.measure(command.params);
      return { measurement };
    }
    case 'solution.annotate': {
      const annotation = await deps.interaction.applyAnnotation(command.params);
      return { annotation };
    }
    case 'solution.simulate': {
      const simulation = await deps.surface.simulateSolution({
        scenarioId: command.params.scenarioId,
        inputs: command.params.inputs,
      });
      return { simulation };
    }
    case 'solution.observe': {
      const interactionState = await deps.interaction.getInteractionState();
      const includeInteractionState = command.params.includeInteractionState !== false;
      const observation = {
        openSolution: deps.openSolution,
        interaction: includeInteractionState ? interactionState : null,
      };
      return { observation };
    }
  }
}
