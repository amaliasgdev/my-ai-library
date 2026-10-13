import { HttpParams } from '@angular/common/http';
import { convertToParamMap, Params } from '@angular/router';
import {
  appendBookFilters,
  parseBookFilters,
  sameBookFilters,
  serializeBookFilters,
} from './book-filters';
import {
  isCanonicalBookCatalogQuery,
  parseBookCatalogQuery,
  sameBookCatalogQuery,
  serializeBookCatalogQuery,
} from './book-catalog-query';

describe('catalog filter URL and HTTP helpers', () => {
  const parse = (params: Params) => parseBookFilters(convertToParamMap(params));
  it('omits empty/default filters and does not send null/undefined/blank', () => {
    expect(parse({})).toEqual({});
    const filters = {
      readingStatus: [],
      genre: ' ',
      publisher: '',
      language: '',
      ratingMin: undefined,
    };
    expect(serializeBookFilters(filters)).toEqual({});
    expect(appendBookFilters(new HttpParams(), filters).keys()).toEqual([]);
  });
  it('deduplicates states in fixed order, trims text and normalizes language', () => {
    expect(
      parse({
        readingStatus: ['READ', 'READING', 'READ'],
        genre: ' Terror ',
        language: ' ES ',
        publisher: ' Press ',
        ratingMin: '4',
        yearFrom: '2020',
        yearTo: '2021',
      }),
    ).toEqual({
      readingStatus: ['READING', 'READ'],
      genre: 'Terror',
      language: 'es',
      publisher: 'Press',
      ratingMin: 4,
      yearFrom: 2020,
      yearTo: 2021,
    });
  });
  it.each([
    ['READ', 'invalid'],
    ['READ,READING'],
    ['read'],
    [''],
    ['READ', 'READ', 'READ', 'READ', 'READ'],
  ])('discards entire invalid state group %j', (...states) => {
    // it.each expands each row into arguments.
    expect(parse({ readingStatus: states })).toEqual({});
  });
  it.each(['ratingMin', 'yearFrom', 'yearTo', 'genre', 'language', 'publisher'])(
    'discards repeated scalar %s independently',
    (key) => {
      expect(parse({ [key]: ['1', '1'], readingStatus: 'READ' })).toEqual({
        readingStatus: ['READ'],
      });
    },
  );
  it.each(['', '-1', '1.5', '1e2', ' 1', '99999999999', 'abc', '０'])(
    'discards invalid numeric %s',
    (value) => {
      expect(parse({ ratingMin: value, yearFrom: value, yearTo: value })).toEqual({});
    },
  );
  it('checks limits, reversed range and retains other valid filters', () => {
    expect(parse({ ratingMin: '6', yearFrom: '0', yearTo: '2101' })).toEqual({});
    expect(parse({ ratingMin: '1', yearFrom: '1', yearTo: '2100' })).toEqual({
      ratingMin: 1,
      yearFrom: 1,
      yearTo: 2100,
    });
    expect(parse({ yearFrom: '2021', yearTo: '2020', ratingMin: '5' })).toEqual({ ratingMin: 5 });
  });
  it('rejects overlong, unknown language and blank values without truncation', () => {
    expect(parse({ genre: 'g'.repeat(51), publisher: 'p'.repeat(256), language: 'zz' })).toEqual(
      {},
    );
    expect(parse({ genre: ' ', publisher: '\t', language: 'es-ES' })).toEqual({});
    expect(parse({ genre: 'g'.repeat(50), publisher: 'p'.repeat(255), language: 'EN' })).toEqual({
      genre: 'g'.repeat(50),
      publisher: 'p'.repeat(255),
      language: 'en',
    });
  });
  it('URL canonicalization permits repeated states only and removes unknown params', () => {
    const raw = convertToParamMap({
      readingStatus: ['READ', 'READING', 'READ'],
      ratingMin: '04',
      language: ' ES ',
      ignored: 'x',
    });
    const query = parseBookCatalogQuery(raw);
    expect(isCanonicalBookCatalogQuery(raw, query)).toBe(false);
    const canonical = serializeBookCatalogQuery(query);
    expect(canonical).toEqual({
      readingStatus: ['READING', 'READ'],
      ratingMin: '4',
      language: 'es',
    });
    expect(isCanonicalBookCatalogQuery(convertToParamMap(canonical), query)).toBe(true);
    expect(
      sameBookCatalogQuery(
        query,
        parseBookCatalogQuery(
          convertToParamMap({ language: 'es', ratingMin: '4', readingStatus: ['READING', 'READ'] }),
        ),
      ),
    ).toBe(true);
  });
  it('compares normalized filter states independent of initial order', () => {
    expect(
      sameBookFilters(
        { readingStatus: ['READ', 'READING', 'READ'] },
        { readingStatus: ['READING', 'READ'] },
      ),
    ).toBe(true);
    expect(sameBookFilters({}, { ratingMin: 4 })).toBe(false);
  });
  it('HTTP serialization repeats states and preserves literal publisher symbols', () => {
    const params = appendBookFilters(new HttpParams(), {
      readingStatus: ['READ', 'READING'],
      publisher: '100%_Press',
      language: ' ES ',
      ratingMin: 4,
    });
    expect(params.getAll('readingStatus')).toEqual(['READING', 'READ']);
    expect(params.get('publisher')).toBe('100%_Press');
    expect(params.get('language')).toBe('es');
    expect(params.get('ratingMin')).toBe('4');
  });
});
