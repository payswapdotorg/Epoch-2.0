import { EscalationError } from './errors.js';

/**
 * Default-deny authorization for the integration seams: nothing is permitted
 * unless the host explicitly grants it. Grants are plain data; every grant
 * defaults to false.
 */
export interface EscalationGrants {
  readonly persist: boolean;
  readonly attachLearnNotes: boolean;
  readonly consumeCapabilityTags: boolean;
}

export type EscalationGrant = keyof EscalationGrants;

export const DENY_ALL_GRANTS: EscalationGrants = {
  persist: false,
  attachLearnNotes: false,
  consumeCapabilityTags: false,
};

export function parseGrants(input?: Partial<EscalationGrants>): EscalationGrants {
  if (input === undefined) {
    return { ...DENY_ALL_GRANTS };
  }
  return {
    persist: input.persist === true,
    attachLearnNotes: input.attachLearnNotes === true,
    consumeCapabilityTags: input.consumeCapabilityTags === true,
  };
}

export function assertGranted(grants: EscalationGrants, grant: EscalationGrant): void {
  if (!grants[grant]) {
    throw new EscalationError('grant-required', `escalation session lacks the "${grant}" grant (default-deny)`, [
      { field: grant, message: 'not granted' },
    ]);
  }
}
