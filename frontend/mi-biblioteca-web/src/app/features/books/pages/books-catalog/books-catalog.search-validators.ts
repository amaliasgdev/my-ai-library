import { ValidatorFn } from '@angular/forms';
import { CRUD_ISBN_PATTERN } from '../../models/isbn-pattern';

export const searchCriteriaValidator: ValidatorFn = (control) => {
  const title = (control.get('title')?.value as string)?.trim();
  const author = (control.get('author')?.value as string)?.trim();
  const isbn = (control.get('isbn')?.value as string)?.trim();
  if (!title && !author && !isbn) return { noCriteria: true };
  if (isbn && (title || author)) return { exclusiveIsbn: true };
  return null;
};

export const searchIsbnValidator: ValidatorFn = (control) => {
  const value = control.value as string;
  return !value.trim() || CRUD_ISBN_PATTERN.test(value) ? null : { isbn: true };
};
