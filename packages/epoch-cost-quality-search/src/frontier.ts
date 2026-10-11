export interface FrontierInput {
  readonly candidates: readonly FrontierSubject[];
  readonly constraints: readonly HardConstraint[];
  readonly preferences: readonly WeightedPreference[];
  readonly costs: readonly LifecycleCost[];
}
