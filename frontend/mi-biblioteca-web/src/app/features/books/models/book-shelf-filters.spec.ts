import { convertToParamMap } from '@angular/router';
import { HttpParams } from '@angular/common/http';
import { parseBookFilters, serializeBookFilters, appendBookFilters } from './book-filters';
import {
  parseBookCatalogQuery,
  serializeBookCatalogQuery,
  isCanonicalBookCatalogQuery,
} from './book-catalog-query';
import {
  createBookFiltersForm,
  filtersFromForm,
  bookFiltersFormValue,
} from '../pages/books-catalog/book-filters.form';

describe('ID filters preserve old bookmarks without inferred reconciliation', () => {
  it('IDs and names coexist and survive context serialization', () => {
    const params = convertToParamMap({
      roomId: '1',
      bookcaseId: '2',
      shelfId: '999999',
      room: ' Salón ',
      page: '2',
      size: '50',
      title: 'Dune',
    });
    const query = parseBookCatalogQuery(params);
    expect(query.filters).toEqual({ roomId: 1, bookcaseId: 2, shelfId: 999999, room: 'Salón' });
    expect(serializeBookCatalogQuery(query)).toMatchObject({
      roomId: '1',
      bookcaseId: '2',
      shelfId: '999999',
      room: 'Salón',
      page: '2',
      size: '50',
      title: 'Dune',
    });
    const http = appendBookFilters(new HttpParams(), query.filters!);
    expect(http.get('shelfId')).toBe('999999');
  });
  it.each(['roomId', 'bookcaseId', 'shelfId'] as const)(
    'validates raw %s cardinality and safe integer range independently',
    (key) => {
      for (const value of ['', '0', '-1', '1.5', ' 1', '1e2', '9007199254740992', ['1', '2']])
        expect(parseBookFilters(convertToParamMap({ [key]: value, room: 'Salón' }))).toEqual({
          room: 'Salón',
        });
      expect(parseBookFilters(convertToParamMap({ [key]: '9007199254740991' }))).toEqual({
        [key]: Number.MAX_SAFE_INTEGER,
      });
      const params = convertToParamMap({ [key]: '0003' });
      const query = parseBookCatalogQuery(params);
      expect(isCanonicalBookCatalogQuery(params, query)).toBe(false);
      expect(serializeBookCatalogQuery(query)).toEqual({ [key]: '3' });
    },
  );
  it('typed draft does not discard nonexistent IDs and can Apply/Clear with normal helpers', () => {
    const form = createBookFiltersForm();
    form.reset(bookFiltersFormValue({ shelfId: 999999, room: 'Salón' }));
    expect(form.valid).toBe(true);
    expect(filtersFromForm(form)).toEqual({ shelfId: 999999, room: 'Salón' });
    form.reset(bookFiltersFormValue());
    expect(filtersFromForm(form)).toEqual({});
    expect(serializeBookFilters({ shelfId: 0 })).toEqual({});
  });
});
