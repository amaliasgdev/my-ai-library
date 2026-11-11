import { MAX_BOOK_GENRES, normalizeGenreKey } from './genre-key';

describe('normalizeGenreKey', () => {
  it('ignores case, accents, outer spaces and inner whitespace runs', () => {
    expect(normalizeGenreKey('  Fantasía  ')).toBe('fantasia');
    expect(normalizeGenreKey('fantasia')).toBe('fantasia');
    expect(normalizeGenreKey('FANTASÍA')).toBe('fantasia');
    expect(normalizeGenreKey('Ciencia   ficción')).toBe(normalizeGenreKey('ciencia ficcion'));
    expect(normalizeGenreKey('Novela\tNegra\n')).toBe('novela negra');
  });

  it('keeps punctuation, digits and interior spacing differences in the key', () => {
    expect(normalizeGenreKey('Ciencia-ficción')).not.toBe(normalizeGenreKey('ciencia ficcion'));
    expect(normalizeGenreKey('Aventura 24')).toBe('aventura 24');
  });

  it('keeps the BookRequest genre maximum at ten', () => {
    expect(MAX_BOOK_GENRES).toBe(10);
  });
});
