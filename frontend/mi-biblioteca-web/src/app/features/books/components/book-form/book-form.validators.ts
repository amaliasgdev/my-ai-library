import { ValidatorFn } from '@angular/forms';
import { isIsoLanguage } from '../../models/iso-language';
import { isLocationLabel } from '../../models/book-location';

export const locationLabel: ValidatorFn = (control) =>
  typeof control.value === 'string' && isLocationLabel(control.value)
    ? null
    : { locationLabel: true };

export { CRUD_ISBN_PATTERN } from '../../models/isbn-pattern';

export const notBlank: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim().length > 0 ? null : { required: true };

export function optionalText(validator: ValidatorFn): ValidatorFn {
  return (control) =>
    control.value === null || (typeof control.value === 'string' && control.value.trim() === '')
      ? null
      : validator(control);
}

export const integer: ValidatorFn = (control) =>
  control.value === null || control.value === '' || Number.isInteger(control.value)
    ? null
    : { integer: true };

export const isoLanguage: ValidatorFn = optionalText((control) => {
  const value: string = control.value;
  return isIsoLanguage(value) ? null : { language: true };
});

export const httpCoverUrl: ValidatorFn = (control) => {
  const value: string = control.value;
  if (value === null || value === '') return null;
  // Validate the original text before URL parsing: URL silently repairs some invalid input.
  if (
    /[\s\p{Cc}\\<>"{}|^`]/u.test(value) ||
    /%(?![\da-f]{2})/i.test(value) ||
    value.split('#').length > 2
  )
    return { coverUrl: true };
  const match = /^https?:\/\/([^/?#]+)(.*)$/i.exec(value);
  if (!match || match[1].includes('@')) return { coverUrl: true };
  const authority = match[1];
  const parts = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(authority);
  if (!parts) return { coverUrl: true };
  const host = parts[1];
  const port = parts[2];
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return { coverUrl: true };
  if (!host.startsWith('[')) {
    const labels = host.replace(/\.$/, '').split('.');
    if (labels.some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) {
      return { coverUrl: true };
    }
  }
  if (/[[\]]/.test(match[2].split(/[?#]/)[0])) return { coverUrl: true };
  try {
    const url = new URL(value);
    return url.hostname ? null : { coverUrl: true };
  } catch {
    return { coverUrl: true };
  }
};

export const genreList: ValidatorFn = (control) => {
  const values: string[] = control.value;
  if (values.length > 10) return { genreLimit: true };
  const normalized = values.map((value) => value.trim().toLowerCase());
  return new Set(normalized).size === normalized.length ? null : { duplicate: true };
};
