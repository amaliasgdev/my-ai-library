/** Maximum number of genres accepted by the BookRequest contract. */
export const MAX_BOOK_GENRES = 10;

/**
 * Normalizes a genre for duplicate detection: trims, collapses inner whitespace runs,
 * strips diacritics and lowercases. Case, outer/inner spacing and accents do not
 * create distinct genres.
 */
export function normalizeGenreKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
