import { convertToParamMap } from '@angular/router';
import { HttpParams } from '@angular/common/http';
import { isLocationLabel } from './book-location';
import { appendBookFilters, parseBookFilters, serializeBookFilters } from './book-filters';
import { parseBookCatalogQuery, serializeBookCatalogQuery } from './book-catalog-query';
import { createBookFiltersForm, filtersFromForm } from '../pages/books-catalog/book-filters.form';

describe('location filters and URL boundary', () => {
  it('parse/serialize trims while preserving case, accents, literal wildcard characters and internal spaces', () => {
    const params = {
      room: ' \u00a0Salón ',
      bookcase: ' Billy  izquierda %_ ',
      shelf: ' Superior ',
    };
    const filters = parseBookFilters(convertToParamMap(params));
    expect(filters).toEqual({ room: 'Salón', bookcase: 'Billy  izquierda %_', shelf: 'Superior' });
    expect(serializeBookFilters(filters)).toEqual(filters);
    const http = appendBookFilters(new HttpParams(), filters);
    expect(http.get('room')).toBe('Salón');
    expect(http.getAll('shelf')).toEqual(['Superior']);
    const query = parseBookCatalogQuery(
      convertToParamMap({ ...params, page: '2', size: '50', title: 'Dune', sortBy: 'author' }),
    );
    expect(serializeBookCatalogQuery(query)).toMatchObject({
      ...filters,
      page: '2',
      size: '50',
      title: 'Dune',
      sortBy: 'author',
    });
  });
  it.each(['room', 'bookcase', 'shelf'] as const)(
    'discards only invalid %s and never truncates',
    (key) => {
      const max = key === 'shelf' ? 50 : 100;
      for (const value of [
        '',
        '   ',
        '\tSalón',
        'Salón\n',
        '\0',
        '\u0085',
        '\u2028',
        '\u2029',
        'x'.repeat(max + 1),
        ' ' + 'x'.repeat(max),
        ['A', 'B'],
      ]) {
        const parsed = parseBookFilters(convertToParamMap({ [key]: value, genre: 'Terror' }));
        expect(parsed).toEqual({ genre: 'Terror' });
      }
      expect(parseBookFilters(convertToParamMap({ [key]: 'á'.repeat(max) }))).toEqual({
        [key]: 'á'.repeat(max),
      });
    },
  );
  it('serialization omits blanks and invalid raw fields and keeps others', () => {
    expect(
      serializeBookFilters({ room: ' ', bookcase: '\t', shelf: 'x'.repeat(51), ratingMin: 4 }),
    ).toEqual({ ratingMin: '4' });
  });
  it('typed filter form uses raw lengths and single-line validation, allows blanks and preserves existing filters', () => {
    const form = createBookFiltersForm();
    form.patchValue({
      room: ' Salón ',
      bookcase: ' Billy ',
      shelf: ' Superior ',
      genre: 'Terror',
      readingStatus: ['READ'],
    });
    expect(form.valid).toBe(true);
    expect(filtersFromForm(form)).toMatchObject({
      room: 'Salón',
      bookcase: 'Billy',
      shelf: 'Superior',
      genre: 'Terror',
      readingStatus: ['READ'],
    });
    form.controls.room.setValue(' ' + 'x'.repeat(100));
    expect(form.invalid).toBe(true);
    form.controls.room.setValue('');
    form.controls.bookcase.setValue('\t');
    expect(form.invalid).toBe(true);
    form.controls.bookcase.setValue('');
    expect(form.valid).toBe(true);
  });
  it('ordinary names accept Unicode, spaces and punctuation, not multiline control labels', () => {
    for (const value of ['Salón', 'Billy  izquierda / nº 2', 'Superior (A)', '3', '100%_', ''])
      expect(isLocationLabel(value)).toBe(true);
    expect(isLocationLabel('Abajo\nArriba')).toBe(false);
  });
});
