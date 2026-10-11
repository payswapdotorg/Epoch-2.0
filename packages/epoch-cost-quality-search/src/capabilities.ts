export interface RegisteredCapability {
  readonly capabilityId: string;
  readonly version: string;
  readonly kind: CapabilityKind;
  readonly servesRoles: readonly string[];        // roles it can occupy in an approach
  readonly addressesMetricIds: readonly string[]; // metric descriptors it plausibly influences
  readonly qualityAttributes: readonly QualityAttribute[];
  readonly requiresCapabilities: readonly string[]; // co-occurrence requirements (capabilityIds)
  readonly incompatibleWith: readonly string[];    // capabilityIds it cannot coexist with
  readonly declarationDigest: string;              // sha256 over canonical declaration body
  readonly sourceRef: string;                      // upstream registry reference (e.g. W023 registry path/id)
}
