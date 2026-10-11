/**
 * Public entrypoint for @zcode/epoch-environment-activity (W029).
 *
 * Surface: typed event core (canonical digests, SHA-256), consent/privacy
 * laws (CapturePolicy with SEPARATE retention and reuse permissions),
 * CaptureController (pause/resume/inspect), coverage/gap/redaction
 * metadata, ActivityEpisode (distinct user-stated vs inferred intent),
 * Demonstration (explicit boundaries, derived coverage, digest-referenced
 * correlations), unverified CandidateExport, and a digest-keyed
 * persistence binding over the W021 WorldStore port shape.
 */

export * from "./canonical.js";
export * from "./freeze.js";
export * from "./errors.js";
export * from "./events.js";
export * from "./coverage.js";
export * from "./policy.js";
export * from "./capture.js";
export * from "./episodes.js";
export * from "./demonstrations.js";
export * from "./candidates.js";
export * from "./persistence.js";
