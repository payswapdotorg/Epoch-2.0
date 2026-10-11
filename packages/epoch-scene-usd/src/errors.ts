/**
 * Typed errors for the epoch-scene-usd composition adapter.
 * Parse errors always carry line/column provenance — never silent skips.
 */

export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

export class UsdaParseError extends Error {
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
  readonly expectation: string | null;

  constructor(message: string, location: SourceLocation, sourceText: string, expectation: string | null = null) {
    const lines = sourceText.split('\n');
    const lineText = lines[location.line - 1] ?? '';
    const snippet = lineText.length > 96 ? lineText.slice(0, 96) : lineText;
    const expectationText = expectation === null ? '' : ` (expected ${expectation})`;
    super(`.usda parse error at ${location.line}:${location.column}: ${message}${expectationText}`);
    this.name = 'UsdaParseError';
    this.line = location.line;
    this.column = location.column;
    this.snippet = snippet;
    this.expectation = expectation;
  }
}

export type SceneCompositionErrorCode =
  | 'empty-layer-stack'
  | 'duplicate-layer-name'
  | 'unresolved-sublayer'
  | 'layer-cycle'
  | 'invalid-compose-option'
  | 'non-canonicalizable-value';

export class SceneCompositionError extends Error {
  readonly code: SceneCompositionErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(code: SceneCompositionErrorCode, message: string, details: Readonly<Record<string, string>> = {}) {
    super(`scene composition error [${code}]: ${message}`);
    this.name = 'SceneCompositionError';
    this.code = code;
    this.details = details;
  }
}
