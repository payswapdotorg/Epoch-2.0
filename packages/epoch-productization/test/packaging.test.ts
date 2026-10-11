import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveDeploymentPlan,
  digestCanonical,
  isPackageManifest,
  parsePackageManifest,
  recomputeManifestDigest,
  serializePackageManifest,
  verifyManifestConsistency,
  type PackageManifest,
  type PackagedArtifact,
} from "../src/contract.js";

const VERSION = "1.2.3";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const ZERO_DIGEST = "0".repeat(64);

function buildPlan() {
  return deriveDeploymentPlan({
    kind: "deployment-plan-input",
    version: VERSION,
    commit: COMMIT,
    targetIds: ["web-static", "desktop-linux-x64"],
  });
}

function artifact(
  role: PackagedArtifact["role"],
  path: string,
  targetIds: readonly string[],
  byteSize = 1024,
): PackagedArtifact {
  return { role, path, targetIds, byteSize, digest: { algorithm: "sha256", hex: ZERO_DIGEST } };
}

function buildManifest(
  artifacts: readonly PackagedArtifact[],
  version = VERSION,
  commit = COMMIT,
): PackageManifest {
  const skeleton = {
    kind: "package-manifest" as const,
    version,
    commit,
    artifacts,
  };
  return { ...skeleton, manifestDigest: digestCanonical(skeleton) };
}

function consistentManifest(): PackageManifest {
  return buildManifest([
    artifact("web-bundle", "artifacts/web-static/web-bundle.tar", ["web-static"]),
    artifact("web-bundle", "artifacts/desktop-linux-x64/web-bundle.tar", ["desktop-linux-x64"]),
    artifact("desktop-installer", "artifacts/desktop-linux-x64/installer.AppImage", ["desktop-linux-x64"]),
    artifact("agent-runtime", "artifacts/desktop-linux-x64/agent-runtime.tar", ["desktop-linux-x64"]),
  ]);
}

test("a consistent manifest verifies cleanly", () => {
  const report = verifyManifestConsistency(consistentManifest(), buildPlan());
  assert.equal(report.consistent, true);
  assert.deepEqual(report.findings, []);
  assert.equal(report.artifactCount, 4);
  assert.equal(report.targetCount, 2);
});

test("version mismatch is an error", () => {
  const report = verifyManifestConsistency(
    buildManifest(consistentManifest().artifacts, "9.9.9"),
    buildPlan(),
  );
  assert.equal(
    report.findings.some((item) => item.code === "manifest-plan-version-mismatch"),
    true,
  );
  assert.equal(report.consistent, false);
});

test("commit mismatch is an error", () => {
  const report = verifyManifestConsistency(
    buildManifest(consistentManifest().artifacts, VERSION, "f".repeat(40)),
    buildPlan(),
  );
  assert.equal(
    report.findings.some((item) => item.code === "manifest-plan-commit-mismatch"),
    true,
  );
  assert.equal(report.consistent, false);
});

test("manifest self-digest mismatch is an error", () => {
  const tampered: PackageManifest = {
    ...consistentManifest(),
    manifestDigest: "1".repeat(64),
  };
  const report = verifyManifestConsistency(tampered, buildPlan());
  assert.equal(
    report.findings.some((item) => item.code === "manifest-digest-mismatch"),
    true,
  );
});

test("plan self-digest mismatch is an error", () => {
  const plan = buildPlan();
  const tamperedPlan = { ...plan, version: "9.9.9" };
  const report = verifyManifestConsistency(consistentManifest(), tamperedPlan);
  assert.equal(
    report.findings.some((item) => item.code === "plan-self-digest-mismatch"),
    true,
  );
});

test("missing artifact for a target is an error", () => {
  const manifest = buildManifest(
    consistentManifest().artifacts.filter(
      (item) => item.role !== "agent-runtime",
    ),
  );
  const report = verifyManifestConsistency(manifest, buildPlan());
  const finding = report.findings.find(
    (item) => item.code === "missing-artifact-for-target",
  );
  assert.notEqual(finding, undefined);
  assert.equal(finding?.targetId, "desktop-linux-x64");
  assert.equal(report.consistent, false);
});

test("unknown artifact targets are errors", () => {
  const manifest = buildManifest([
    ...consistentManifest().artifacts,
    artifact("agent-runtime", "artifacts/win/agent-runtime.tar", ["desktop-win32-x64"]),
  ]);
  const report = verifyManifestConsistency(manifest, buildPlan());
  assert.equal(
    report.findings.some((item) => item.code === "artifact-target-unknown"),
    true,
  );
  assert.equal(report.consistent, false);
});

test("malformed artifact digests are errors", () => {
  const malformed: PackagedArtifact = {
    ...artifact("web-bundle", "artifacts/bad.tar", ["web-static"]),
    digest: { algorithm: "md5", hex: "not-hex" } as unknown as PackagedArtifact["digest"],
  };
  const report = verifyManifestConsistency(buildManifest([...consistentManifest().artifacts, malformed]), buildPlan());
  assert.equal(
    report.findings.some((item) => item.code === "artifact-digest-malformed"),
    true,
  );
});

test("negative byte sizes are errors; zero sizes are warnings", () => {
  const negative = buildManifest([
    ...consistentManifest().artifacts,
    artifact("agent-runtime", "artifacts/neg.tar", ["web-static"], -5),
  ]);
  const negativeReport = verifyManifestConsistency(negative, buildPlan());
  const negativeFinding = negativeReport.findings.find(
    (item) => item.code === "artifact-size-invalid",
  );
  assert.equal(negativeFinding?.severity, "error");
  assert.equal(negativeReport.consistent, false);

  const zero = buildManifest([
    artifact("web-bundle", "artifacts/web-static/web-bundle.tar", ["web-static"], 0),
    artifact("web-bundle", "artifacts/desktop/web-bundle.tar", ["desktop-linux-x64"], 0),
    artifact("desktop-installer", "artifacts/desktop/installer.bin", ["desktop-linux-x64"], 0),
    artifact("agent-runtime", "artifacts/desktop/runtime.tar", ["desktop-linux-x64"], 0),
  ]);
  const zeroReport = verifyManifestConsistency(zero, buildPlan());
  const zeroFinding = zeroReport.findings.find(
    (item) => item.code === "artifact-size-invalid",
  );
  assert.equal(zeroFinding?.severity, "warning");
  assert.equal(zeroReport.consistent, true);
});

test("duplicate artifact role+target and duplicate paths are errors", () => {
  const manifest = buildManifest([
    artifact("web-bundle", "artifacts/dup.tar", ["web-static"]),
    artifact("web-bundle", "artifacts/dup.tar", ["web-static"]),
    ...consistentManifest().artifacts,
  ]);
  const report = verifyManifestConsistency(manifest, buildPlan());
  assert.equal(
    report.findings.some((item) => item.code === "duplicate-artifact-target"),
    true,
  );
  assert.equal(
    report.findings.some((item) => item.code === "duplicate-artifact-path"),
    true,
  );
});

test("empty target lists and empty paths are errors", () => {
  const manifest = buildManifest([
    artifact("web-bundle", "", ["web-static"]),
    ...consistentManifest().artifacts,
    artifact("agent-runtime", "artifacts/empty-targets.tar", []),
  ]);
  const report = verifyManifestConsistency(manifest, buildPlan());
  assert.equal(
    report.findings.some((item) => item.code === "artifact-path-empty"),
    true,
  );
  assert.equal(
    report.findings.some((item) => item.code === "artifact-target-empty"),
    true,
  );
});

test("isPackageManifest: structural guard", () => {
  assert.equal(isPackageManifest(consistentManifest()), true);
  assert.equal(
    isPackageManifest({ ...consistentManifest(), kind: "other" }),
    false,
  );
  assert.equal(isPackageManifest({ version: "1.0.0" }), false);
  assert.equal(
    isPackageManifest({ ...consistentManifest(), artifacts: "nope" }),
    false,
  );
});

test("parsePackageManifest: round trip and tamper rejection", () => {
  const manifest = consistentManifest();
  const text = serializePackageManifest(manifest);
  const parsed = parsePackageManifest(text);
  assert.notEqual(parsed, null);
  assert.deepEqual(parsed, manifest);
  const tampered = text.replace(
    '"path":"artifacts/web-static/web-bundle.tar"',
    '"path":"hacked"',
  );
  assert.equal(parsePackageManifest(tampered), null);
});

test("serializePackageManifest: canonical key order", () => {
  const base = consistentManifest();
  const reordered: PackageManifest = {
    manifestDigest: base.manifestDigest,
    artifacts: [...base.artifacts],
    commit: COMMIT,
    version: VERSION,
    kind: "package-manifest",
  };
  assert.equal(
    serializePackageManifest(reordered),
    serializePackageManifest(base),
  );
  assert.equal(recomputeManifestDigest(base), base.manifestDigest);
});
