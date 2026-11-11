import { bookFiltersFormValue, createBookFiltersForm, filtersFromForm } from './book-filters.form';

describe('typed catalog filter form', () => {
  it('starts empty and valid and normalizes accepted drafts', () => {
    const form = createBookFiltersForm();
    expect(form.valid).toBe(true);
    expect(filtersFromForm(form)).toEqual({});
    form.reset(
      bookFiltersFormValue({
        readingStatus: ['READ', 'READING'],
        ratingMin: 4,
        yearFrom: 2020,
        yearTo: 2020,
        genre: [' Terror ', 'Fantasía', 'terror'],
        genreUnassigned: true,
        language: ' ES ',
        publisher: ' Press ',
      }),
    );
    expect(form.valid).toBe(true);
    expect(filtersFromForm(form)).toEqual({
      readingStatus: ['READING', 'READ'],
      ratingMin: 4,
      yearFrom: 2020,
      yearTo: 2020,
      genre: ['Fantasía', 'Terror'],
      genreUnassigned: true,
      language: 'es',
      publisher: 'Press',
    });
  });
  it.each([0, 6, 1.5])('rejects rating %s', (value) => {
    const form = createBookFiltersForm();
    form.controls.ratingMin.setValue(value);
    expect(form.invalid).toBe(true);
  });
  it.each([0, 2101, 2020.5])('rejects year %s', (value) => {
    const form = createBookFiltersForm();
    form.controls.yearFrom.setValue(value);
    expect(form.invalid).toBe(true);
    form.controls.yearFrom.reset();
    form.controls.yearTo.setValue(value);
    expect(form.invalid).toBe(true);
  });
  it('validates reversed ranges, text limits and language', () => {
    const form = createBookFiltersForm();
    form.patchValue({ yearFrom: 2021, yearTo: 2020 });
    expect(form.hasError('yearRange')).toBe(true);
    form.patchValue({ yearTo: null });
    expect(form.valid).toBe(true);
    form.patchValue({
      genre: { genres: ['x'.repeat(51)], genreUnassigned: false },
      publisher: 'x'.repeat(256),
      language: 'zz',
    });
    expect(form.controls.genre.invalid).toBe(true);
    expect(form.controls.publisher.invalid).toBe(true);
    expect(form.controls.language.invalid).toBe(true);
  });
  it('accepts at most 50 distinct genres and rejects duplicates or overflow', () => {
    const form = createBookFiltersForm();
    form.controls.genre.setValue({
      genres: Array.from({ length: 50 }, (_, index) => `Género ${index}`),
      genreUnassigned: false,
    });
    expect(form.controls.genre.valid).toBe(true);
    form.controls.genre.setValue({
      genres: Array.from({ length: 51 }, (_, index) => `Género ${index}`),
      genreUnassigned: false,
    });
    expect(form.controls.genre.invalid).toBe(true);
    form.controls.genre.setValue({
      genres: ['Terror', 'terror'],
      genreUnassigned: false,
    });
    expect(form.controls.genre.invalid).toBe(true);
  });
});
