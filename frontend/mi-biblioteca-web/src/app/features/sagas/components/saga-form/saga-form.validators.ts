import { ValidatorFn } from '@angular/forms';
import { httpCoverUrl, notBlank } from '../../../books/components/book-form/book-form.validators';

export { notBlank };

/** Same robust HTTP/HTTPS rules as book covers, with a saga-specific error key. */
export const httpImageUrl: ValidatorFn = (control) =>
  httpCoverUrl(control) ? { imageUrl: true } : null;
