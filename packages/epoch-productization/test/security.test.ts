import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECURITY_CHECKLIST_SECTIONS,
  knownSecretPatternIds,
  redactPreview,
  redactSecrets,
  scanForSecrets,
  securityChecklist,
  securityChecklistDigest,
  securityChecksBySection,
  shannonEntropy,
} from "../src/contract.js";

const GH_CLASSIC = "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"; // epoch-scan-ignore
const GH_OAUTH = "gho_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"; // epoch-scan-ignore
const GH_APP = "ghu_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"; // epoch-scan-ignore
const GH_REFRESH =
  "ghr_X9y8Z7w6V5u4T3s2R1q0P9o8N7m6L5k4J3j2I1h0G9f8e7d6c5b4a3Z2Y1x0w9v8u7T5"; // epoch-scan-ignore
const GH_FINE = "github_pat_" + "A1b2C3".repeat(14); // epoch-scan-ignore
const NPM_TOKEN = "npm_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"; // epoch-scan-ignore
const SLACK_TOKEN = "xoxb-A1b2C3d4E5f6G7h8I9j0K1l2M3n4"; // epoch-scan-ignore
const AWS_KEY = "AKIA1234567890ABCDEF"; // epoch-scan-ignore
const GOOGLE_KEY = "AIza" + "A1b2".repeat(9).slice(0, 35); // epoch-scan-ignore
const PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----"; // epoch-scan-ignore
const HIGH_ENTROPY = "A7fK2mQ9zR4vX1cB6nH3jL5pT8wY0eD2gS9uM4iO"; // epoch-scan-ignore
const BEARER_TOKEN = "q8Z7v2Xm1Kd9Lp4Rt6Yw3Jc5Hb8Nf2Gs"; // epoch-scan-ignore
const LOCKFILE_B64 = "q8Z7v2Xm1Kd9Lp4Rt6Yw3Jc5Hb8Nf2Gs";

test("security checklist: three sections in frozen order", () => {
  assert.deepEqual(SECURITY_CHECKLIST_SECTIONS, [
    "token-hygiene",
    "dependency-audit",
    "permission-surface",
  ]);
});

test("security checklist: checks are unique, ordered, and commands stay data", () => {
  const checks = securityChecklist().checks;
  assert.equal(checks.length, 13);
  const ids = checks.map((check) => check.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    assert.notEqual(check, undefined);
    assert.equal(check.ordering, index + 1);
  }
  for (const check of checks) {
    if (check.command.argv.length === 0) {
      assert.equal(check.automated, false, `${check.id} has no command and must be manual`);
    } else {
      assert.equal(
        check.automated === true || check.automated === false,
        true,
      );
    }
  }
});

test("securityChecksBySection: partitions the checklist", () => {
  const total = SECURITY_CHECKLIST_SECTIONS.reduce(
    (sum, section) => sum + securityChecksBySection(section).length,
    0,
  );
  assert.equal(total, securityChecklist().checks.length);
  assert.equal(securityChecksBySection("token-hygiene").length, 5);
  assert.equal(securityChecksBySection("dependency-audit").length, 4);
  assert.equal(securityChecksBySection("permission-surface").length, 4);
});

test("securityChecklistDigest: stable canonical digest", () => {
  assert.equal(securityChecklistDigest(), securityChecklistDigest());
  assert.match(securityChecklistDigest(), /^[0-9a-f]{64}$/);
});

test("scanForSecrets: detects the GitHub token family", () => {
  const samples: readonly [string, string][] = [
    [GH_CLASSIC, "github-classic-token"],
    [GH_FINE, "github-fine-grained-token"],
    [GH_OAUTH, "github-oauth-token"],
    [GH_APP, "github-app-token"],
    [GH_REFRESH, "github-refresh-token"],
  ];
  for (const [token, pattern] of samples) {
    const findings = scanForSecrets(`prefix ${token} suffix`);
    assert.equal(findings.length, 1, pattern);
    assert.equal(findings[0]?.pattern, pattern);
    assert.equal(findings[0]?.severity, "critical");
  }
});

test("scanForSecrets: detects npm, Slack, AWS and Google shapes", () => {
  const samples: readonly [string, string, "critical" | "high"][] = [
    [NPM_TOKEN, "npm-token", "critical"],
    [SLACK_TOKEN, "slack-token", "critical"],
    [AWS_KEY, "aws-access-key-id", "high"],
    [GOOGLE_KEY, "google-api-key", "high"],
  ];
  for (const [token, pattern, severity] of samples) {
    const findings = scanForSecrets(`value: ${token}`);
    assert.equal(findings.length, 1, pattern);
    assert.equal(findings[0]?.pattern, pattern);
    assert.equal(findings[0]?.severity, severity);
  }
});

test("scanForSecrets: detects private key blocks", () => {
  const findings = scanForSecrets(`${PRIVATE_KEY}\nMIIE...\n`); // epoch-scan-ignore
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.pattern, "private-key-block");
  assert.equal(findings[0]?.severity, "critical");
});

test("scanForSecrets: detects credentials embedded in URLs", () => {
  const findings = scanForSecrets("postgres://admin:hunter2secret@db.internal:5432/app"); // epoch-scan-ignore
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.pattern, "url-embedded-credentials");
  assert.equal(findings[0]?.severity, "critical");
});

test("scanForSecrets: skips URL templates and env references", () => {
  assert.deepEqual(scanForSecrets("postgres://app:${DB_PASS}@db.internal/app"), []);
  assert.deepEqual(scanForSecrets("postgres://app:$DB_PASS@db.internal/app"), []);
});

test("scanForSecrets: detects entropy-bearing bearer tokens", () => {
  const findings = scanForSecrets(`Authorization: Bearer ${BEARER_TOKEN}`); // epoch-scan-ignore
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.pattern, "generic-bearer-token");
  assert.equal(findings[0]?.severity, "high");
  assert.notEqual(findings[0]?.entropy, null);
  assert.ok((findings[0]?.entropy ?? 0) >= 3.5);
});

test("scanForSecrets: detects secret-looking assignments", () => {
  const findings = scanForSecrets("GITHUB_TOKEN=abc123def456ghi789"); // epoch-scan-ignore
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.pattern, "env-secret-assignment");
  assert.equal(findings[0]?.severity, "high");
});

test("scanForSecrets: skips placeholder and template values", () => {
  assert.deepEqual(scanForSecrets("PASSWORD=changeme"), []);
  assert.deepEqual(scanForSecrets("API_KEY=${VAULT_KEY}"), []);
  assert.deepEqual(scanForSecrets("TOKEN=[REDACTED:github-classic-token]"), []);
});

test("scanForSecrets: flags high-entropy words of 40+ characters", () => {
  const findings = scanForSecrets(`blob ${HIGH_ENTROPY} end`); // epoch-scan-ignore
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.pattern, "high-entropy-word");
  assert.equal(findings[0]?.severity, "medium");
  assert.ok((findings[0]?.entropy ?? 0) >= 4.8);
});

test("scanForSecrets: ignores prose and hex digests", () => {
  const prose =
    "The quick brown fox jumps over the lazy dog while release gates run. " +
    "Nothing secret lives here, only ordinary sentences and punctuation.";
  const hex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  assert.deepEqual(scanForSecrets(prose), []);
  assert.deepEqual(scanForSecrets(hex), []);
});

test("scanForSecrets: ignores lockfile integrity hashes", () => {
  assert.deepEqual(
    scanForSecrets(`integrity: "sha512-${LOCKFILE_B64.repeat(3)}"`),
    [],
  );
  assert.deepEqual(
    scanForSecrets(`digest: sha256:${LOCKFILE_B64.repeat(3)}`),
    [],
  );
});

test("findings carry 1-based line and column positions", () => {
  const text = `line one\nline two\ntoken ${GH_CLASSIC} here`; // epoch-scan-ignore
  const findings = scanForSecrets(text);
  const finding = findings[0];
  assert.notEqual(finding, undefined);
  assert.equal(finding?.line, 3);
  assert.equal(finding?.column, 7);
  assert.equal(finding?.length, GH_CLASSIC.length);
});

test("previews never leak secret material", () => {
  const findings = scanForSecrets(`x ${GH_CLASSIC} y`); // epoch-scan-ignore
  const preview = findings[0]?.preview ?? "";
  assert.equal(preview.includes(GH_CLASSIC), false);
  assert.equal(preview.startsWith("ghp_"), true);
  assert.equal(preview.endsWith("[REDACTED 40 chars]"), true);
});

test("redactSecrets replaces matches with typed markers", () => {
  const redacted = redactSecrets(`token=${GH_CLASSIC}`); // epoch-scan-ignore
  assert.equal(redacted.includes(GH_CLASSIC), false);
  assert.equal(redacted.includes("[REDACTED:github-classic-token]"), true);
});

test("redactPreview: marker-less patterns fully redact", () => {
  assert.equal(
    redactPreview("whatever", "high-entropy-word"),
    "[REDACTED:high-entropy-word:8 chars]",
  );
});

test("shannonEntropy: known values", () => {
  assert.equal(shannonEntropy("aaaa"), 0);
  assert.equal(shannonEntropy("ab"), 1);
  assert.equal(shannonEntropy("abcd"), 2);
});

test("knownSecretPatternIds: stable and complete", () => {
  const ids = knownSecretPatternIds();
  assert.equal(new Set(ids).size, 14);
  assert.deepEqual([...ids].sort(), [
    "aws-access-key-id",
    "env-secret-assignment",
    "generic-bearer-token",
    "github-app-token",
    "github-classic-token",
    "github-fine-grained-token",
    "github-oauth-token",
    "github-refresh-token",
    "google-api-key",
    "high-entropy-word",
    "npm-token",
    "private-key-block",
    "slack-token",
    "url-embedded-credentials",
  ]);
});

test("overlapping matches deduplicate to the most specific shape", () => {
  const findings = scanForSecrets(`Authorization: Bearer ${GH_CLASSIC}`); // epoch-scan-ignore
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.pattern, "github-classic-token");
});
