/**
 * Deterministic lexer for the bounded .usda text subset, with line/column tracking.
 *
 * Column conventions (pinned by the frozen acceptance tests):
 * - Token positions are 1-based (line, column) at the token's first character.
 * - The eof token reports the position immediately after the last non-trivia
 *   token, so unclosed-block errors point at the end of the last real token
 *   instead of past trailing newlines.
 * - The unexpected-character error reports the column immediately after the
 *   offending character's column.
 * - Unterminated string/asset/path errors report the opening character's column.
 */

import { UsdaParseError, type SourceLocation } from '../errors.js';

export type TokenType = 'ident' | 'string' | 'number' | 'asset' | 'path' | 'punct' | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly line: number;
  readonly column: number;
}

export interface LexStart {
  readonly index: number;
  readonly line: number;
  readonly column: number;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

export function tokenize(source: string, start: LexStart = { index: 0, line: 1, column: 1 }): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  let i = start.index;
  let line = start.line;
  let column = start.column;
  const at = (index: number): string | undefined => (index < n ? source[index] : undefined);
  // Position immediately after the last non-trivia token (eof reports this).
  let afterLastToken: { line: number; column: number } = { line: start.line, column: start.column };
  const pushToken = (type: TokenType, value: string, loc: SourceLocation): void => {
    tokens.push({ type, value, line: loc.line, column: loc.column });
    afterLastToken = { line, column };
  };

  while (i < n) {
    const ch = at(i);
    if (ch === undefined) break;
    if (ch === '\n') {
      line += 1;
      column = 1;
      i += 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      column += 1;
      i += 1;
      continue;
    }
    if (ch === '#') {
      while (i < n && at(i) !== '\n') i += 1;
      continue;
    }
    const loc: SourceLocation = { line, column };

    if (ch === '"') {
      let value = '';
      i += 1;
      column += 1;
      let closed = false;
      while (i < n) {
        const c = at(i);
        if (c === undefined || c === '\n') break;
        if (c === '\\') {
          const esc = at(i + 1);
          if (esc === '"' || esc === '\\') value += esc;
          else if (esc === 'n') value += '\n';
          else if (esc === 't') value += '\t';
          else if (esc === 'r') value += '\r';
          else {
            throw new UsdaParseError(`invalid escape sequence '\\${esc ?? ''}' in string literal`, loc, source);
          }
          i += 2;
          column += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          i += 1;
          column += 1;
          break;
        }
        value += c;
        i += 1;
        column += 1;
      }
      if (!closed) throw new UsdaParseError('unterminated string literal', loc, source, 'closing "');
      pushToken('string', value, loc);
      continue;
    }

    if (ch === '@') {
      let value = '';
      i += 1;
      column += 1;
      let closed = false;
      while (i < n) {
        const c = at(i);
        if (c === undefined || c === '\n') break;
        if (c === '@') {
          closed = true;
          i += 1;
          column += 1;
          break;
        }
        value += c;
        i += 1;
        column += 1;
      }
      if (!closed) throw new UsdaParseError('unterminated asset path literal', loc, source, 'closing @');
      pushToken('asset', value, loc);
      continue;
    }

    if (ch === '<') {
      let value = '';
      i += 1;
      column += 1;
      let closed = false;
      while (i < n) {
        const c = at(i);
        if (c === undefined || c === '\n') break;
        if (c === '>') {
          closed = true;
          i += 1;
          column += 1;
          break;
        }
        value += c;
        i += 1;
        column += 1;
      }
      if (!closed) throw new UsdaParseError('unterminated prim path literal', loc, source, 'closing >');
      pushToken('path', value, loc);
      continue;
    }

    if (ch === '-' || DIGIT.test(ch)) {
      let value = '';
      if (ch === '-') {
        value = '-';
        i += 1;
        column += 1;
        const nextChar = at(i);
        if (nextChar === undefined || !DIGIT.test(nextChar)) {
          throw new UsdaParseError('malformed number: expected digit after minus sign', loc, source);
        }
      }
      while (i < n && DIGIT.test(at(i) ?? '')) {
        value += at(i);
        i += 1;
        column += 1;
      }
      const dot = at(i);
      if (dot === '.') {
        value += '.';
        i += 1;
        column += 1;
        const afterDot = at(i);
        if (afterDot === undefined || !DIGIT.test(afterDot)) {
          throw new UsdaParseError('malformed number: expected digit after decimal point', loc, source);
        }
        while (i < n && DIGIT.test(at(i) ?? '')) {
          value += at(i);
          i += 1;
          column += 1;
        }
      }
      const exp = at(i);
      if (exp === 'e' || exp === 'E') {
        value += exp;
        i += 1;
        column += 1;
        const sign = at(i);
        if (sign === '+' || sign === '-') {
          value += sign;
          i += 1;
          column += 1;
        }
        const expDigit = at(i);
        if (expDigit === undefined || !DIGIT.test(expDigit)) {
          throw new UsdaParseError('malformed number exponent', loc, source);
        }
        while (i < n && DIGIT.test(at(i) ?? '')) {
          value += at(i);
          i += 1;
          column += 1;
        }
      }
      pushToken('number', value, loc);
      continue;
    }

    if (IDENT_START.test(ch)) {
      let value = '';
      while (i < n && IDENT_CHAR.test(at(i) ?? '')) {
        value += at(i);
        i += 1;
        column += 1;
      }
      pushToken('ident', value, loc);
      continue;
    }

    if ('(){}[]=,'.includes(ch)) {
      i += 1;
      column += 1;
      pushToken('punct', ch, loc);
      continue;
    }

    // Column+1: unexpected-character errors report the column immediately
    // after the offending character (pinned by the frozen acceptance tests).
    throw new UsdaParseError(`unexpected character '${ch}'`, { line: loc.line, column: loc.column + 1 }, source);
  }

  tokens.push({ type: 'eof', value: '', line: afterLastToken.line, column: afterLastToken.column });
  return tokens;
}
