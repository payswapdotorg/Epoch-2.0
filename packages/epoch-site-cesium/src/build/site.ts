import { digestJson } from "../canonical.js";
import type { BuildSiteModelInput, SiteModel } from "../types/site.js";
import type { SiteModelBuildResult, SiteModelValidationResult } from "../types/validation.js";
import { validateSiteModel } from "./validate.js";

/**
 * Deterministic site model builder: applies defaults, then delegates every
 * invariant to validateSiteModel so a built site and a validated site can
 * never disagree. Timestamps are inputs; this machine reads neither clock
 * nor environment.
 */
export function buildSiteModel(input: BuildSiteModelInput): SiteModelBuildResult {
  const candidate: SiteModel = {
    kind: "site-model",
    siteId: input.siteId,
    displayName: input.displayName,
    crs: input.crs,
    extents: input.extents,
    terrain: input.terrain === undefined ? [] : [...input.terrain],
    imagery: input.imagery === undefined ? [] : [...input.imagery],
    entities: input.entities === undefined ? [] : [...input.entities],
    metadata: input.metadata === undefined ? {} : { ...input.metadata },
  };
  const validation: SiteModelValidationResult = validateSiteModel(candidate);
  if (!validation.ok) {
    return { ok: false, rejection: validation.rejection };
  }
  return { ok: true, site: candidate };
}

/** Content digest of a site model: SHA-256 over its canonical JSON. */
export function digestSiteModel(site: SiteModel): string {
  return digestJson(site);
}
