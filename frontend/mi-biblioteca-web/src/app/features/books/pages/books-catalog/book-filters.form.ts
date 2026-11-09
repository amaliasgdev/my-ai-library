import { FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { BookFilters, FILTER_STATES } from '../../models/book-filters';
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
      genre: new FormControl('', { nonNullable: true, validators: [trimmedText(50)] }),
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
    genre: filters.genre ?? '',
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
  for (const key of ['genre', 'language', 'publisher'] as const) {
    const text = value[key].trim();
    if (text) filters[key] = key === 'language' ? text.toLowerCase() : text;
  }
  return filters;
}
