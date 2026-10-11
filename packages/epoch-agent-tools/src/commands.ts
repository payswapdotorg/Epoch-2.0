/**
 * W024 — Agent Tools: command VALIDATION.
 *
 * The command TYPES live in `./contract.js` (the contract home); this module
 * re-exports them (import stability for existing `./commands.js` importers,
 * including the public barrel) and hosts `validateAgentCommand` — the runtime
 * structural validation of every command kind. Illegal commands are rejected
 * with typed errors downstream — never silently corrected.
 */
import { isAgentCommandKind } from './kinds.js';
import type { AgentCommandKind } from './kinds.js';
import type { AgentCommand } from './contract.js';
import {
  isBoolean,
  isFiniteNumber,
  isNonEmptyString,
  isNonEmptyStringArray,
  isObject,
  isString,
  isStringArray,
  isVec3,
} from './guards.js';

export * from './contract.js';

export type AgentCommandValidation =
  | { readonly ok: true; readonly kind: AgentCommandKind; readonly command: AgentCommand }
  | { readonly ok: false; readonly kind: unknown; readonly issues: readonly string[] };

export function validateAgentCommand(input: unknown): AgentCommandValidation {
  if (!isObject(input)) {
    return { ok: false, kind: undefined, issues: ['command must be a plain object'] };
  }
  const kind = input['kind'];
  if (!isAgentCommandKind(kind)) {
    return {
      ok: false,
      kind,
      issues: [`unknown command kind: ${isString(kind) ? `"${kind}"` : typeof kind}`],
    };
  }
  const issues: string[] = [];
  if (!isNonEmptyString(input['sessionId'])) {
    issues.push('sessionId must be a non-empty string');
  }
  const authorization = input['authorization'];
  if (!isObject(authorization) || !isNonEmptyString(authorization['tokenId'])) {
    issues.push('authorization reference must be an object with a non-empty tokenId');
  }
  const provenance = input['provenance'];
  if (!isObject(provenance) || !isNonEmptyString(provenance['agentId'])) {
    issues.push('provenance must be an object with a non-empty agentId');
  } else {
    if (provenance['tool'] !== undefined && !isString(provenance['tool'])) {
      issues.push('provenance.tool must be a string when present');
    }
    if (provenance['reason'] !== undefined && !isString(provenance['reason'])) {
      issues.push('provenance.reason must be a string when present');
    }
    if (provenance['correlationId'] !== undefined && !isString(provenance['correlationId'])) {
      issues.push('provenance.correlationId must be a string when present');
    }
  }
  const params = input['params'];
  if (!isObject(params)) {
    issues.push('params must be a plain object');
  } else {
    validateParams(kind, params, issues);
  }
  if (issues.length > 0) {
    return { ok: false, kind, issues };
  }
  return { ok: true, kind, command: input as unknown as AgentCommand };
}

function validateParams(
  kind: AgentCommandKind,
  params: Record<string, unknown>,
  issues: string[],
): void {
  switch (kind) {
    case 'solution.open': {
      if (!isNonEmptyString(params['solutionId'])) {
        issues.push('params.solutionId must be a non-empty string');
      }
      if (params['revision'] !== undefined && !isString(params['revision'])) {
        issues.push('params.revision must be a string when present');
      }
      if (params['readOnly'] !== undefined && !isBoolean(params['readOnly'])) {
        issues.push('params.readOnly must be a boolean when present');
      }
      return;
    }
    case 'solution.select': {
      const mode = params['mode'];
      if (mode !== 'replace' && mode !== 'add' && mode !== 'remove' && mode !== 'clear') {
        issues.push('params.mode must be one of "replace" | "add" | "remove" | "clear"');
        return;
      }
      if (!isStringArray(params['elementIds'])) {
        issues.push('params.elementIds must be an array of strings');
        return;
      }
      const elementIds = params['elementIds'];
      if (mode === 'clear' && elementIds.length > 0) {
        issues.push('params.elementIds must be empty when mode is "clear"');
      }
      if (mode !== 'clear' && elementIds.length === 0) {
        issues.push('params.elementIds must contain at least one element id when mode is not "clear"');
      }
      return;
    }
    case 'solution.inspect': {
      if (!isNonEmptyStringArray(params['elementIds'])) {
        issues.push('params.elementIds must be a non-empty array of non-empty strings');
      }
      if (params['includeProperties'] !== undefined && !isBoolean(params['includeProperties'])) {
        issues.push('params.includeProperties must be a boolean when present');
      }
      if (params['includeRelations'] !== undefined && !isBoolean(params['includeRelations'])) {
        issues.push('params.includeRelations must be a boolean when present');
      }
      return;
    }
    case 'solution.navigate': {
      validateNavigationTarget(params['target'], issues);
      const options = params['options'];
      if (options !== undefined) {
        if (!isObject(options)) {
          issues.push('params.options must be a plain object when present');
        } else {
          if (options['fit'] !== undefined && !isBoolean(options['fit'])) {
            issues.push('params.options.fit must be a boolean when present');
          }
          if (options['direction'] !== undefined && !isVec3(options['direction'])) {
            issues.push('params.options.direction must be a [x, y, z] finite number triple when present');
          }
        }
      }
      return;
    }
    case 'solution.isolate': {
      const mode = params['mode'];
      if (mode !== 'isolate' && mode !== 'show-all') {
        issues.push('params.mode must be one of "isolate" | "show-all"');
        return;
      }
      if (!isStringArray(params['elementIds'])) {
        issues.push('params.elementIds must be an array of strings');
        return;
      }
      const elementIds = params['elementIds'];
      if (mode === 'isolate' && elementIds.length === 0) {
        issues.push('params.elementIds must contain at least one element id when mode is "isolate"');
      }
      if (mode === 'show-all' && elementIds.length > 0) {
        issues.push('params.elementIds must be empty when mode is "show-all"');
      }
      return;
    }
    case 'solution.measure': {
      const measureKind = params['kind'];
      if (measureKind === 'clear') {
        return;
      }
      if (measureKind !== 'distance') {
        issues.push('params.kind must be one of "distance" | "clear"');
        return;
      }
      validateMeasureAnchor('params.from', params['from'], issues);
      validateMeasureAnchor('params.to', params['to'], issues);
      return;
    }
    case 'solution.annotate': {
      const action = params['action'];
      if (action === 'remove') {
        if (!isNonEmptyString(params['annotationId'])) {
          issues.push('params.annotationId must be a non-empty string when action is "remove"');
        }
        return;
      }
      if (action !== 'add') {
        issues.push('params.action must be one of "add" | "remove"');
        return;
      }
      if (!isNonEmptyString(params['annotationId'])) {
        issues.push('params.annotationId must be a non-empty string when action is "add"');
      }
      if (!isNonEmptyString(params['text'])) {
        issues.push('params.text must be a non-empty string when action is "add"');
      }
      if (params['elementId'] !== undefined && !isNonEmptyString(params['elementId'])) {
        issues.push('params.elementId must be a non-empty string when present');
      }
      if (params['anchor'] !== undefined && !isVec3(params['anchor'])) {
        issues.push('params.anchor must be a [x, y, z] finite number triple when present');
      }
      return;
    }
    case 'solution.simulate': {
      if (!isNonEmptyString(params['scenarioId'])) {
        issues.push('params.scenarioId must be a non-empty string');
      }
      const inputs = params['inputs'];
      if (!isObject(inputs)) {
        issues.push('params.inputs must be a plain record of string | number | boolean values');
        return;
      }
      for (const [key, value] of Object.entries(inputs)) {
        if (!isString(value) && !isFiniteNumber(value) && !isBoolean(value)) {
          issues.push(`params.inputs["${key}"] must be a string, finite number or boolean`);
        }
      }
      return;
    }
    case 'solution.observe': {
      if (
        params['includeInteractionState'] !== undefined &&
        !isBoolean(params['includeInteractionState'])
      ) {
        issues.push('params.includeInteractionState must be a boolean when present');
      }
      return;
    }
  }
}

function validateNavigationTarget(target: unknown, issues: string[]): void {
  if (!isObject(target)) {
    issues.push('params.target must be a plain object');
    return;
  }
  const kind = target['kind'];
  if (kind === 'home') {
    return;
  }
  if (kind === 'elements') {
    if (!isNonEmptyStringArray(target['elementIds'])) {
      issues.push(
        'params.target.elementIds must be a non-empty array of non-empty strings when target.kind is "elements"',
      );
    }
    return;
  }
  if (kind === 'point') {
    if (!isVec3(target['point'])) {
      issues.push('params.target.point must be a [x, y, z] finite number triple when target.kind is "point"');
    }
    return;
  }
  issues.push('params.target.kind must be one of "elements" | "point" | "home"');
}

function validateMeasureAnchor(field: string, anchor: unknown, issues: string[]): void {
  if (!isObject(anchor)) {
    issues.push(`${field} must be a plain object`);
    return;
  }
  const kind = anchor['kind'];
  if (kind === 'point') {
    if (!isVec3(anchor['point'])) {
      issues.push(`${field}.point must be a [x, y, z] finite number triple when ${field}.kind is "point"`);
    }
    return;
  }
  if (kind === 'element') {
    if (!isNonEmptyString(anchor['elementId'])) {
      issues.push(`${field}.elementId must be a non-empty string when ${field}.kind is "element"`);
    }
    const anchorMode = anchor['anchor'];
    if (anchorMode !== undefined && anchorMode !== 'origin' && anchorMode !== 'center') {
      issues.push(`${field}.anchor must be one of "origin" | "center" when present`);
    }
    return;
  }
  issues.push(`${field}.kind must be one of "point" | "element"`);
}
