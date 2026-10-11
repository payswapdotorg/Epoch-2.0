/**
 * Shared parser core for the bounded .usda text subset: the token cursor,
 * token-consumption helpers, the reserved-word set and the typed-error paths.
 *
 * Column conventions (pinned by the frozen acceptance tests): token positions
 * are 1-based at the token's first character; expected-string rejections and
 * structural-keyword rejections report the column immediately after the
 * offending token's start; the eof token reports the position immediately
 * after the last non-trivia token (see lexer.ts).
 *
 * The grammar itself lives in parser-document.ts (document/layer/prim-header
 * and prim-metadata parsing) and parser-body.ts (prim-body, property,
 * variantSet and value parsing), chained by inheritance.
 */

import { UsdaParseError } from '../errors.js';
import type { Token } from './lexer.js';

/** Reserved words that cannot be used as type names or property names. */
export const RESERVED_WORDS = new Set([
  'def', 'over', 'class', 'variantSet', 'custom', 'rel', 'relationship', 'selected',
  'references', 'inherits', 'payload', 'variants', 'variantSets', 'subLayers', 'true', 'false',
]);

/** The layer metadata header token every .usda document must start with. */
export const USDA_HEADER = '#usda 1.0';

function describeToken(t: Token): string {
  switch (t.type) {
    case 'eof':
      return 'end of file';
    case 'string':
      return `string "${t.value}"`;
    case 'number':
      return `number ${t.value}`;
    case 'ident':
      return `identifier '${t.value}'`;
    case 'asset':
      return `asset @${t.value}@`;
    case 'path':
      return `path <${t.value}>`;
    case 'punct':
      return `'${t.value}'`;
  }
}

/** Abstract base: cursor state + token consumption + typed-error paths. */
export abstract class ParserCore {
  private pos = 0;

  constructor(
    private readonly tokens: readonly Token[],
    protected readonly text: string,
  ) {}

  protected peek(offset = 0): Token {
    const index = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[index] as Token;
  }

  protected next(): Token {
    const t = this.tokens[this.pos] as Token;
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return t;
  }

  protected err(message: string, tok: Token, expectation: string | null = null): never {
    throw new UsdaParseError(
      `${message} (found ${describeToken(tok)})`,
      { line: tok.line, column: tok.column },
      this.text,
      expectation,
    );
  }

  /**
   * Structural-rejection error: reports the column immediately after the
   * offending token's start (convention pinned by the frozen acceptance
   * tests — e.g. 'arc keyword as a body statement' at 2:18, 'subLayers on a
   * prim' at 2:18, 'prim name must be a quoted string' at 2:12).
   */
  protected errAfterStart(message: string, tok: Token, expectation: string | null = null): never {
    throw new UsdaParseError(
      `${message} (found ${describeToken(tok)})`,
      { line: tok.line, column: tok.column + 1 },
      this.text,
      expectation,
    );
  }

  protected isPunct(ch: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'punct' && t.value === ch;
  }

  protected expectPunct(ch: string, what = `'${ch}'`): Token {
    const t = this.peek();
    if (t.type !== 'punct' || t.value !== ch) this.err(`expected '${ch}' ${what === `'${ch}'` ? '' : what}`.trim(), t, `'${ch}'`);
    return this.next();
  }

  protected expectString(what: string): Token {
    const t = this.peek();
    if (t.type !== 'string') this.errAfterStart(`expected ${what}`, t, 'quoted string');
    return this.next();
  }

  protected expectIdent(what: string): Token {
    const t = this.peek();
    if (t.type !== 'ident') this.err(`expected ${what}`, t, 'identifier');
    return this.next();
  }
}
