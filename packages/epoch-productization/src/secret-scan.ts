import { compareStrings } from "./canonical.js";

/**
 * Pure secret-surface matcher: known token shapes, URL-embedded
 * credentials, secret-looking assignments, and an entropy fallback.
 *
 * LAWS:
 * - pure: operates only on the provided text; no filesystem, no network;
 * - findings never carry secret material: `preview` is a redacted marker;
 * - deterministic: identical text yields identical findings in text
 *   order; overlapping candidates are deduplicated with priority to the
 *   most specific shape.
 */

export type SecretPatternId =
  | "github-classic-token"
  | "github-fine-grained-token"
  | "github-oauth-token"
  | "github-app-token"
  | "github-refresh-token"
  | "npm-token"
  | "slack-token"
  | "aws-access-key-id"
  | "google-api-key"
  | "private-key-block"
  | "url-embedded-credentials"
  | "generic-bearer-token"
  | "env-secret-assignment"
  | "high-entropy-word";

export type SecretSeverity = "critical" | "high" | "medium";

export interface SecretFinding {
  readonly pattern: SecretPatternId;
  readonly severity: SecretSeverity;
  readonly line: number;
  readonly column: number;
  readonly length: number;
  readonly preview: string;
  readonly entropy: number | null;
}

interface SecretHit {
  readonly pattern: SecretPatternId;
  readonly severity: SecretSeverity;
  readonly start: number;
  readonly end: number;
  readonly raw: string;
  readonly entropy: number | null;
  readonly priority: number;
}

interface ShapePattern {
  readonly pattern: SecretPatternId;
  readonly severity: SecretSeverity;
  readonly regex: RegExp;
}

const SHAPE_PATTERNS: readonly ShapePattern[] = [
  { pattern: "github-classic-token", severity: "critical", regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { pattern: "github-fine-grained-token", severity: "critical", regex: /\bgithub_pat_[A-Za-z0-9_]{80,120}\b/g },
  { pattern: "github-oauth-token", severity: "critical", regex: /\bgho_[A-Za-z0-9]{36}\b/g },
  { pattern: "github-app-token", severity: "critical", regex: /\bghu_[A-Za-z0-9]{36}\b/g },
  { pattern: "github-refresh-token", severity: "critical", regex: /\bghr_[A-Za-z0-9]{76}\b/g },
  { pattern: "npm-token", severity: "critical", regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { pattern: "slack-token", severity: "critical", regex: /\bxox[a-z]-[A-Za-z0-9-]{10,250}\b/g },
  { pattern: "aws-access-key-id", severity: "high", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { pattern: "google-api-key", severity: "high", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { pattern: "private-key-block", severity: "critical", regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

const URL_CREDENTIAL_PATTERN = /:\/\/[^\s:@/"]{1,64}:[^\s@/"]{4,128}@/g;
const BEARER_PATTERN = /(?:^|[^A-Za-z0-9])[Bb]earer[ \t]+([A-Za-z0-9._~+/=-]{24,512})/g;
const ENV_ASSIGNMENT_PATTERN =
  /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*["']?([^\s"'#]{4,256})/;
const SECRET_VAR_PATTERN = /(SECRET|TOKEN|PASSWORD|PASSPHRASE|API_?KEY|PRIVATE_?KEY|CREDENTIAL)/i;
const ENTROPY_WORD_PATTERN = /[A-Za-z0-9+/_-]{40,512}/g;
const LOCKFILE_HASH_PREFIX = /^sha[0-9]+-/;
const LOCKFILE_HASH_BEFORE = /sha[0-9]+[-:]$/;

const PLACEHOLDER_VALUES: readonly string[] = [
  "changeme", "change-me", "placeholder", "dummy", "example", "sample",
  "fixme", "todo", "redacted", "xxxx", "your-token-here", "not-a-secret",
  "test", "testing", "abc123", "1234", "0123456789",
];

const PATTERN_MARKERS: Record<SecretPatternId, string> = {
  "github-classic-token": "ghp_",
  "github-fine-grained-token": "github_pat_",
  "github-oauth-token": "gho_",
  "github-app-token": "ghu_",
  "github-refresh-token": "ghr_",
  "npm-token": "npm_",
  "slack-token": "xox",
  "aws-access-key-id": "AKIA",
  "google-api-key": "AIza",
  "private-key-block": "-----BEGIN",
  "url-embedded-credentials": "://",
  "generic-bearer-token": "bearer",
  "env-secret-assignment": "",
  "high-entropy-word": "",
};

export function scanForSecrets(text: string): readonly SecretFinding[] {
  const hits = collectHits(text);
  const lineStarts = computeLineStarts(text);
  const findings: SecretFinding[] = [];
  for (const hit of hits) {
    const position = lineColumnAt(hit.start, lineStarts);
    findings.push(
      Object.freeze({
        pattern: hit.pattern,
        severity: hit.severity,
        line: position.line,
        column: position.column,
        length: hit.end - hit.start,
        preview: redactPreview(hit.raw, hit.pattern),
        entropy: hit.entropy,
      }),
    );
  }
  return Object.freeze(findings);
}

export function redactSecrets(text: string): string {
  const hits = collectHits(text);
  let output = text;
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const hit = hits[index];
    if (hit === undefined) {
      continue;
    }
    output =
      output.slice(0, hit.start) +
      `[REDACTED:${hit.pattern}]` +
      output.slice(hit.end);
  }
  return output;
}

export function redactPreview(match: string, pattern: SecretPatternId): string {
  const marker = PATTERN_MARKERS[pattern];
  if (marker === "") {
    return `[REDACTED:${pattern}:${match.length} chars]`;
  }
  return `${marker}…[REDACTED ${match.length} chars]`;
}

export function shannonEntropy(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const character of text) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / text.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function knownSecretPatternIds(): readonly SecretPatternId[] {
  return Object.freeze(Object.keys(PATTERN_MARKERS) as SecretPatternId[]);
}

function collectHits(text: string): readonly SecretHit[] {
  const hits: SecretHit[] = [];
  for (const shape of SHAPE_PATTERNS) {
    collectShapeHits(text, shape, hits);
  }
  collectUrlCredentialHits(text, hits);
  collectBearerHits(text, hits);
  collectEnvAssignmentHits(text, hits);
  collectEntropyHits(text, hits);
  return Object.freeze(dedupeHits(hits));
}

function collectShapeHits(
  text: string,
  shape: ShapePattern,
  hits: SecretHit[],
): void {
  shape.regex.lastIndex = 0;
  for (
    let match = shape.regex.exec(text);
    match !== null;
    match = shape.regex.exec(text)
  ) {
    const raw = match[0];
    if (raw === undefined) {
      break;
    }
    hits.push({
      pattern: shape.pattern,
      severity: shape.severity,
      start: match.index,
      end: match.index + raw.length,
      raw,
      entropy: null,
      priority: 0,
    });
  }
}

function collectUrlCredentialHits(text: string, hits: SecretHit[]): void {
  URL_CREDENTIAL_PATTERN.lastIndex = 0;
  for (
    let match = URL_CREDENTIAL_PATTERN.exec(text);
    match !== null;
    match = URL_CREDENTIAL_PATTERN.exec(text)
  ) {
    const raw = match[0];
    if (raw === undefined) {
      break;
    }
    const rest = raw.slice(3);
    const colon = rest.indexOf(":");
    const password = rest.slice(colon + 1).slice(0, -1);
    if (isTemplateValue(password)) {
      continue;
    }
    hits.push({
      pattern: "url-embedded-credentials",
      severity: "critical",
      start: match.index,
      end: match.index + raw.length,
      raw,
      entropy: null,
      priority: 0,
    });
  }
}

function collectBearerHits(text: string, hits: SecretHit[]): void {
  BEARER_PATTERN.lastIndex = 0;
  for (
    let match = BEARER_PATTERN.exec(text);
    match !== null;
    match = BEARER_PATTERN.exec(text)
  ) {
    const raw = match[0];
    const token = match[1];
    if (raw === undefined || token === undefined) {
      break;
    }
    const entropy = shannonEntropy(token);
    if (entropy < 3.5) {
      continue;
    }
    const start = match.index + raw.length - token.length;
    hits.push({
      pattern: "generic-bearer-token",
      severity: "high",
      start,
      end: start + token.length,
      raw: token,
      entropy,
      priority: 1,
    });
  }
}

function collectEnvAssignmentHits(text: string, hits: SecretHit[]): void {
  let offset = 0;
  for (const line of text.split("\n")) {
    const match = ENV_ASSIGNMENT_PATTERN.exec(line);
    if (match !== null) {
      const name = match[1];
      const value = match[2];
      if (
        name !== undefined &&
        value !== undefined &&
        SECRET_VAR_PATTERN.test(name) &&
        !isPlaceholderValue(value)
      ) {
        const start = offset + match[0].length - value.length;
        hits.push({
          pattern: "env-secret-assignment",
          severity: "high",
          start,
          end: start + value.length,
          raw: value,
          entropy: shannonEntropy(value),
          priority: 1,
        });
      }
    }
    offset += line.length + 1;
  }
}

function collectEntropyHits(text: string, hits: SecretHit[]): void {
  ENTROPY_WORD_PATTERN.lastIndex = 0;
  for (
    let match = ENTROPY_WORD_PATTERN.exec(text);
    match !== null;
    match = ENTROPY_WORD_PATTERN.exec(text)
  ) {
    const word = match[0];
    if (word === undefined) {
      break;
    }
    if (LOCKFILE_HASH_PREFIX.test(word)) {
      continue;
    }
    const before = text.slice(Math.max(0, match.index - 10), match.index);
    if (LOCKFILE_HASH_BEFORE.test(before)) {
      continue;
    }
    const start = match.index;
    const end = start + word.length;
    if (hits.some((hit) => start < hit.end && hit.start < end)) {
      continue;
    }
    const entropy = shannonEntropy(word);
    if (entropy >= 4.8) {
      hits.push({
        pattern: "high-entropy-word",
        severity: "medium",
        start,
        end,
        raw: word,
        entropy,
        priority: 2,
      });
    }
  }
}

function isTemplateValue(value: string): boolean {
  return (
    value.startsWith("$") || value.startsWith("{") || value.startsWith("[")
  );
}

function isPlaceholderValue(value: string): boolean {
  if (isTemplateValue(value)) {
    return true;
  }
  return (
    PLACEHOLDER_VALUES.includes(value.toLowerCase()) ||
    /^(?:true|false|null|undefined|on|off|yes|no)$/i.test(value)
  );
}

function dedupeHits(hits: readonly SecretHit[]): readonly SecretHit[] {
  const sorted = [...hits].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    if (left.end !== right.end) {
      return right.end - left.end;
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return compareStrings(left.pattern, right.pattern);
  });
  const kept: SecretHit[] = [];
  let lastEnd = -1;
  for (const hit of sorted) {
    if (hit.start >= lastEnd) {
      kept.push(hit);
      lastEnd = hit.end;
    }
  }
  return Object.freeze(kept);
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineColumnAt(
  offset: number,
  lineStarts: readonly number[],
): { line: number; column: number } {
  let line = 1;
  for (let index = 0; index < lineStarts.length; index += 1) {
    const start = lineStarts[index];
    if (start === undefined) {
      break;
    }
    if (start <= offset) {
      line = index + 1;
    } else {
      break;
    }
  }
  const lineStart = lineStarts[line - 1] ?? 0;
  return { line, column: offset - lineStart + 1 };
}
