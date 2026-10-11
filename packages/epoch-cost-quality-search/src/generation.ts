export interface AlternativeGenerationInput {
  readonly baseline: SolutionBaseline;
  readonly requirements: RequirementSet;
  readonly registeredCapabilities: readonly RegisteredCapability[];
}

export function generateAlternatives(input: AlternativeGenerationInput): AlternativeGenerationResult
