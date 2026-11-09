import { HttpParams } from '@angular/common/http';
import { ParamMap, Params } from '@angular/router';
import { ReadingStatus } from './book.models';
import { isIsoLanguage } from './iso-language';

export interface BookFilters {
  readingStatus?: ReadingStatus[];
  ratingMin?: number;
  yearFrom?: number;
  yearTo?: number;
  genre?: string;
  language?: string;
  publisher?: string;
}

export const FILTER_STATES: ReadingStatus[] = ['TO_READ', 'READING', 'READ', 'ABANDONED'];

export function parseBookFilters(params: ParamMap): BookFilters {
  const result: BookFilters = {};
  const rawStates = params.getAll('readingStatus');
  if (
    rawStates.length <= 4 &&
    rawStates.every((value) => FILTER_STATES.includes(value as ReadingStatus))
  ) {
    const states = FILTER_STATES.filter((value) => rawStates.includes(value));
    if (states.length) result.readingStatus = states;
  }
  for (const key of ['ratingMin', 'yearFrom', 'yearTo'] as const) {
    const raw = params.getAll(key);
    const value = raw.length === 1 && /^[0-9]+$/.test(raw[0]) ? Number(raw[0]) : NaN;
    if (Number.isInteger(value) && value >= 1 && value <= (key === 'ratingMin' ? 5 : 2100))
      result[key] = value;
  }
  if (
    result.yearFrom !== undefined &&
    result.yearTo !== undefined &&
    result.yearFrom > result.yearTo
  ) {
    delete result.yearFrom;
    delete result.yearTo;
  }
  for (const key of ['genre', 'language', 'publisher'] as const) {
    const raw = params.getAll(key);
    const value = raw.length === 1 ? raw[0].trim() : '';
    if (!value || value.length > (key === 'genre' ? 50 : key === 'language' ? 2 : 255)) continue;
    if (key === 'language') {
      if (isIsoLanguage(value)) result.language = value.toLowerCase();
    } else result[key] = value;
  }
  return result;
}

export function serializeBookFilters(filters: BookFilters = {}): Params {
  const result: Params = {};
  const states = FILTER_STATES.filter((state) => filters.readingStatus?.includes(state));
  if (states.length) result['readingStatus'] = states;
  for (const key of ['ratingMin', 'yearFrom', 'yearTo'] as const) {
    if (filters[key] != null) result[key] = String(filters[key]);
  }
  for (const key of ['genre', 'language', 'publisher'] as const) {
    const value = filters[key]?.trim();
    if (value) result[key] = key === 'language' ? value.toLowerCase() : value;
  }
  return result;
}

export function sameBookFilters(a: BookFilters = {}, b: BookFilters = {}): boolean {
  return JSON.stringify(serializeBookFilters(a)) === JSON.stringify(serializeBookFilters(b));
}

export function appendBookFilters(params: HttpParams, filters: BookFilters): HttpParams {
  for (const [key, value] of Object.entries(serializeBookFilters(filters))) {
    for (const item of Array.isArray(value) ? value : [value])
      params = params.append(key, String(item));
  }
  return params;
}
