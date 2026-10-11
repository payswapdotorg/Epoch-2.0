/**
 * Deterministic comparison helpers (internal).
 *
 * Lexicographic UTF-16 code-unit order — identical on every platform, and the
 * same order `Array#sort` would produce by default. Made explicit so no
 * locale-aware comparison can sneak into deterministic machines.
 */

/** Compare two strings lexicographically (UTF-16 code units). */
export function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** Lexicographically smallest string, or null when the list is empty. */
export function smallestString(values: readonly string[]): string | null {
  let smallest: string | null = null;
  for (const value of values) {
    if (smallest === null || compareStrings(value, smallest) < 0) {
      smallest = value;
    }
  }
  return smallest;
}
