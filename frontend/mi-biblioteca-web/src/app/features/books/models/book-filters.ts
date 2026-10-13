import { HttpParams } from '@angular/common/http';
import { ParamMap, Params } from '@angular/router';
import { ReadingStatus } from './book.models';
import { isIsoLanguage } from './iso-language';
import { isLocationLabel, LOCATION_LIMITS } from './book-location';

export interface BookFilters {
  readingStatus?: ReadingStatus[];
  ratingMin?: number;
  yearFrom?: number;
  yearTo?: number;
  genre?: string;
  language?: string;
  publisher?: string;
  room?: string;
  bookcase?: string;
  shelf?: string;
  roomId?: number;
  bookcaseId?: number;
  shelfId?: number;
}

export const FILTER_STATES: ReadingStatus[] = ['TO_READ', 'READING', 'READ', 'ABANDONED'];

export function parseBookFilters(params: ParamMap): BookFilters {
  const result: BookFilters = {};
  for (const key of ['roomId', 'bookcaseId', 'shelfId'] as const) {
    const raw = params.getAll(key);
    const value = raw.length === 1 && /^[0-9]+$/.test(raw[0]) ? Number(raw[0]) : NaN;
    if (Number.isSafeInteger(value) && value > 0) result[key] = value;
  }
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
  for (const key of ['room', 'bookcase', 'shelf'] as const) {
    const raw = params.getAll(key);
    if (raw.length !== 1 || raw[0].length > LOCATION_LIMITS[key] || !isLocationLabel(raw[0]))
      continue;
    const value = raw[0].trim();
    if (value) result[key] = value;
  }
  return result;
}

export function serializeBookFilters(filters: BookFilters = {}): Params {
  const result: Params = {};
  for (const key of ['roomId', 'bookcaseId', 'shelfId'] as const) {
    const value = filters[key];
    if (value !== undefined && Number.isSafeInteger(value) && value > 0)
      result[key] = String(value);
  }
  const states = FILTER_STATES.filter((state) => filters.readingStatus?.includes(state));
  if (states.length) result['readingStatus'] = states;
  for (const key of ['ratingMin', 'yearFrom', 'yearTo'] as const) {
    if (filters[key] != null) result[key] = String(filters[key]);
  }
  for (const key of ['genre', 'language', 'publisher'] as const) {
    const value = filters[key]?.trim();
    if (value) result[key] = key === 'language' ? value.toLowerCase() : value;
  }
  for (const key of ['room', 'bookcase', 'shelf'] as const) {
    const raw = filters[key];
    if (raw === undefined || raw.length > LOCATION_LIMITS[key] || !isLocationLabel(raw)) continue;
    const value = raw.trim();
    if (value) result[key] = value;
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
