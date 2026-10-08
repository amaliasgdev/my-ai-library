import { FormControl } from '@angular/forms';
import {
  CRUD_ISBN_PATTERN,
  genreList,
  httpCoverUrl,
  integer,
  isoLanguage,
  notBlank,
} from './book-create.validators';

describe('Book create validators', () => {
  it.each(['', ' ', '\t\n'])('should reject a blank required value: %j', (value) => {
    expect(notBlank(new FormControl(value))).toEqual({ required: true });
  });

  it('should accept text with outer spaces', () => {
    expect(notBlank(new FormControl(' Título '))).toBeNull();
  });

  it.each([null, 1, 2100, 2147483647])('should accept an optional integer: %s', (value) => {
    expect(integer(new FormControl(value))).toBeNull();
  });

  it.each([1.5, NaN, Infinity, '123'])('should reject a noninteger: %s', (value) => {
    expect(integer(new FormControl(value))).toEqual({ integer: true });
  });

  it.each(['', ' ', 'es', 'ES', 'en', 'iw', 'in', 'ji', 'mo'])(
    'should accept a backend language or empty optional: %j',
    (value) => {
      expect(isoLanguage(new FormControl(value))).toBeNull();
    },
  );

  it.each(['zz', 'es-ES', 'eng', 'éS', ' es '])(
    'should reject an unknown or malformed language: %j',
    (value) => {
      expect(isoLanguage(new FormControl(value))).toEqual({ language: true });
    },
  );

  it.each(['1234567890', '978-0132350884', '0-306-40615-x'])(
    'should accept CRUD ISBN format without checksum: %s',
    (value) => {
      expect(CRUD_ISBN_PATTERN.test(value)).toBe(true);
    },
  );

  it.each([
    '',
    'https://example.test/cover.jpg',
    'HTTP://localhost:8081/cover',
    'http://127.0.0.1:65535/a',
    'http://[::1]:8081/a',
    'https://example.test/a%20b?x=1#cover',
  ])('should accept a syntax-only HTTP cover URL: %j', (value) => {
    expect(httpCoverUrl(new FormControl(value))).toBeNull();
  });

  it.each([
    ' ',
    ' https://example.test/a',
    'https://example.test/a ',
    '/cover.jpg',
    'ftp://example.test/a',
    'https:///a',
    'https://user:pass@example.test/a',
    'https://example.test:0/a',
    'https://example.test:65536/a',
    'https://example.test:/a',
    'https://example.test/%ZZ',
    'https://example.test/a b',
    'https://example.test\\a',
    'https://bad_host.test/a',
    'https://example.test/[a]',
    'https://example.test/a\u0000b',
    'https://example.test/a#b#c',
  ])('should reject a malformed cover without silently repairing it: %j', (value) => {
    expect(httpCoverUrl(new FormControl(value))).toEqual({ coverUrl: true });
  });

  it('should enforce genre count and case-insensitive trimmed uniqueness', () => {
    expect(genreList(new FormControl([]))).toBeNull();
    expect(genreList(new FormControl(['Fantasía', ' fantasía ']))).toEqual({ duplicate: true });
    expect(genreList(new FormControl(Array.from({ length: 11 }, (_, i) => `Genre ${i}`)))).toEqual({
      genreLimit: true,
    });
  });
});
