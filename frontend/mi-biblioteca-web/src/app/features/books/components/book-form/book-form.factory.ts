import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { BookRequest } from '../../models/book.models';
import {
  CRUD_ISBN_PATTERN,
  genreList,
  httpCoverUrl,
  integer,
  isoLanguage,
  notBlank,
  optionalText,
} from './book-form.validators';

/** Same controls for the editor and preflight of already-confirmed import requests. */
export function createBookForm() {
  return new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(255)],
    }),
    author: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(255)],
    }),
    isbn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20), optionalText(Validators.pattern(CRUD_ISBN_PATTERN))],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    publisher: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    publicationYear: new FormControl<number | null>(null, [
      integer,
      Validators.min(1),
      Validators.max(2100),
    ]),
    pageCount: new FormControl<number | null>(null, [
      integer,
      Validators.min(1),
      Validators.max(2147483647),
    ]),
    language: new FormControl('', { nonNullable: true, validators: [isoLanguage] }),
    coverUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2048), httpCoverUrl],
    }),
    genres: new FormArray<FormControl<string>>([], genreList),
  });
}

export function validConfirmedBookRequest(request: BookRequest): boolean {
  const form = createBookForm();
  for (const genre of request.genres)
    form.controls.genres.push(
      new FormControl(genre, {
        nonNullable: true,
        validators: [notBlank, Validators.maxLength(50)],
      }),
    );
  form.patchValue({
    ...request,
    isbn: request.isbn ?? '',
    description: request.description ?? '',
    publisher: request.publisher ?? '',
    language: request.language ?? '',
    coverUrl: request.coverUrl ?? '',
  });
  return form.valid;
}
