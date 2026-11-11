import { FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import {
  BookFilters,
  EMPTY_GENRE_FILTER,
  FILTER_STATES,
  GenreFilterValue,
  normalizeGenreFilter,
  normalizeGenres,
} from '../../models/book-filters';
import { ReadingStatus } from '../../models/book.models';
import { isIsoLanguage } from '../../models/iso-language';

const integer: ValidatorFn = (control) =>
  control.value === null || Number.isInteger(control.value) ? null : { integer: true };
const trimmedText =
  (max: number): ValidatorFn =>
  (control) =>
    typeof control.value === 'string' && control.value.trim().length <= max
      ? null
      : { maxlength: true };
const language: ValidatorFn = (control) =>
  !control.value.trim() || isIsoLanguage(control.value.trim()) ? null : { language: true };
const states: ValidatorFn = (control) =>
  Array.isArray(control.value) &&
  control.value.length <= 4 &&
  control.value.every((value: ReadingStatus) => FILTER_STATES.includes(value))
    ? null
    : { states: true };
const yearRange: ValidatorFn = (control) => {
  const { yearFrom, yearTo } = control.value as { yearFrom: number | null; yearTo: number | null };
  return yearFrom !== null && yearTo !== null && yearFrom > yearTo ? { yearRange: true } : null;
};
const genreFilter: ValidatorFn = (control) => {
  const value = control.value as Partial<GenreFilterValue> | null;
  if (!value || !Array.isArray(value.genres) || typeof value.genreUnassigned !== 'boolean')
    return { genres: true };
  const normalized = normalizeGenres(value.genres);
  return normalized.length === value.genres.length ? null : { genres: true };
};

export function createBookFiltersForm() {
  return new FormGroup(
    {
      readingStatus: new FormControl<ReadingStatus[]>([], {
        nonNullable: true,
        validators: [states],
      }),
      ratingMin: new FormControl<number | null>(null, [
        integer,
        Validators.min(1),
        Validators.max(5),
      ]),
      yearFrom: new FormControl<number | null>(null, [
        integer,
        Validators.min(1),
        Validators.max(2100),
      ]),
      yearTo: new FormControl<number | null>(null, [
        integer,
        Validators.min(1),
        Validators.max(2100),
      ]),
      genre: new FormControl<GenreFilterValue>(EMPTY_GENRE_FILTER, {
        nonNullable: true,
        validators: [genreFilter],
      }),
      language: new FormControl('', { nonNullable: true, validators: [language] }),
      publisher: new FormControl('', { nonNullable: true, validators: [trimmedText(255)] }),
    },
    { validators: [yearRange] },
  );
}

export function bookFiltersFormValue(filters: BookFilters = {}) {
  return {
    readingStatus: filters.readingStatus ?? [],
    ratingMin: filters.ratingMin ?? null,
    yearFrom: filters.yearFrom ?? null,
    yearTo: filters.yearTo ?? null,
    genre: normalizeGenreFilter({
      genres: filters.genre ?? [],
      genreUnassigned: filters.genreUnassigned ?? false,
    }),
    language: filters.language ?? '',
    publisher: filters.publisher ?? '',
  };
}

export function filtersFromForm(form: ReturnType<typeof createBookFiltersForm>): BookFilters {
  const value = form.getRawValue();
  const filters: BookFilters = {};
  const selected = FILTER_STATES.filter((state) => value.readingStatus.includes(state));
  if (selected.length) filters.readingStatus = selected;
  for (const key of ['ratingMin', 'yearFrom', 'yearTo'] as const)
    if (value[key] !== null) filters[key] = value[key];
  const genre = normalizeGenreFilter(value.genre);
  if (genre.genres.length) filters.genre = genre.genres;
  if (genre.genreUnassigned) filters.genreUnassigned = true;
  for (const key of ['language', 'publisher'] as const) {
    const text = value[key].trim();
    if (text) filters[key] = key === 'language' ? text.toLowerCase() : text;
  }
  return filters;
}
