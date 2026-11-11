import { HttpParams } from '@angular/common/http';
import { ParamMap, Params } from '@angular/router';
import { ReadingStatus } from './book.models';
import { isIsoLanguage } from './iso-language';

export interface BookFilters {
  readingStatus?: ReadingStatus[];
  ratingMin?: number;
  yearFrom?: number;
  yearTo?: number;
  /** Repeated `genre` parameters. Kept accent-sensitive, like the API. */
  genre?: string[];
  /** OR branch that includes books whose genre array is empty. */
  genreUnassigned?: boolean;
  language?: string;
  publisher?: string;
}

/** Value exposed by the catalog-only multi-select genre filter. */
export interface GenreFilterValue {
  genres: string[];
  genreUnassigned: boolean;
}

export const MAX_FILTER_GENRES = 50;

export const EMPTY_GENRE_FILTER: GenreFilterValue = { genres: [], genreUnassigned: false };

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
  const rawGenres = params.getAll('genre');
  if (rawGenres.length <= 50) {
    const genres = normalizeGenres(rawGenres);
    if (genres.length) result.genre = genres;
  }
  const unassigned = params.getAll('genreUnassigned');
  if (unassigned.length === 1 && unassigned[0] === 'true') result.genreUnassigned = true;
  for (const key of ['language', 'publisher'] as const) {
    const raw = params.getAll(key);
    const value = raw.length === 1 ? raw[0].trim() : '';
    if (!value || value.length > (key === 'language' ? 2 : 255)) continue;
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
  const genres = normalizeGenres(filters.genre ?? []);
  if (genres.length) result['genre'] = genres;
  if (filters.genreUnassigned) result['genreUnassigned'] = 'true';
  for (const key of ['language', 'publisher'] as const) {
    const value = filters[key]?.trim();
    if (value) result[key] = key === 'language' ? value.toLowerCase() : value;
  }
  return result;
}

/** Trims and deduplicates without folding accents, matching the API's filter semantics. */
export function normalizeGenres(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const genres: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (!value || value.length > 50 || seen.has(key)) continue;
    seen.add(key);
    genres.push(value);
  }
  return genres.sort(compareGenres).slice(0, MAX_FILTER_GENRES);
}

/** Normalizes a combined genre draft and caps it at the filter limit of 50. */
export function normalizeGenreFilter(
  value: Partial<GenreFilterValue> | null | undefined,
): GenreFilterValue {
  return {
    genres: normalizeGenres(Array.isArray(value?.genres) ? value.genres : []),
    genreUnassigned: value?.genreUnassigned === true,
  };
}

/** Locale-independent deterministic order for canonical URLs and HTTP parameters. */
function compareGenres(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left !== right) return left < right ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
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
