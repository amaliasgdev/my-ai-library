import { convertToParamMap } from '@angular/router';
import {
  DEFAULT_SAGA_LIST_QUERY,
  isCanonicalSagaListQuery,
  parseSagaListQuery,
  sameSagaListQuery,
  serializeSagaListQuery,
  SAGA_PAGE_SIZES,
} from './saga-list-query';

describe('saga list URL query', () => {
  it('parses defaults when no parameters are present', () => {
    expect(parseSagaListQuery(convertToParamMap({}))).toEqual(DEFAULT_SAGA_LIST_QUERY);
    expect(SAGA_PAGE_SIZES).toEqual([10, 20, 50, 100]);
  });

  it('trims a valid name and keeps zero-based pages and allowed sizes', () => {
    expect(
      parseSagaListQuery(convertToParamMap({ name: '  Vampiros  ', page: '1', size: '50' })),
    ).toEqual({ page: 1, size: 50, name: 'Vampiros' });
  });

  it('normalizes invalid pages, sizes and names independently', () => {
    for (const page of ['-1', '01', '1.5', 'abc', '2147483648', '']) {
      expect(parseSagaListQuery(convertToParamMap({ page })).page).toBe(0);
    }
    for (const size of ['0', '30', '020', 'abc', '101']) {
      expect(parseSagaListQuery(convertToParamMap({ size })).size).toBe(20);
    }
    for (const name of ['   ', 'x'.repeat(256), 'line\nbreak']) {
      expect(parseSagaListQuery(convertToParamMap({ name })).name).toBe('');
    }
  });

  it('serializes only non-default values', () => {
    expect(serializeSagaListQuery(DEFAULT_SAGA_LIST_QUERY)).toEqual({});
    expect(serializeSagaListQuery({ page: 2, size: 10, name: 'Vampiros' })).toEqual({
      page: '2',
      size: '10',
      name: 'Vampiros',
    });
  });

  it('detects canonical and non-canonical URLs', () => {
    const empty = parseSagaListQuery(convertToParamMap({}));
    expect(isCanonicalSagaListQuery(convertToParamMap({}), empty)).toBe(true);
    const query = { page: 1, size: 50, name: 'Vampiros' };
    const canonical = convertToParamMap({ page: '1', size: '50', name: 'Vampiros' });
    expect(isCanonicalSagaListQuery(canonical, query)).toBe(true);
    expect(isCanonicalSagaListQuery(convertToParamMap({ page: '01' }), query)).toBe(false);
    expect(isCanonicalSagaListQuery(convertToParamMap({ page: '1', unknown: 'x' }), query)).toBe(
      false,
    );
  });

  it('compares applied queries by value', () => {
    expect(
      sameSagaListQuery({ page: 0, size: 20, name: '' }, { page: 0, size: 20, name: '' }),
    ).toBe(true);
    expect(
      sameSagaListQuery({ page: 0, size: 20, name: '' }, { page: 1, size: 20, name: '' }),
    ).toBe(false);
  });
});
