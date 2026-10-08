import { ValidatorFn } from '@angular/forms';

export const CRUD_ISBN_PATTERN = /^(?:97[89][- ]?)?[0-9][- 0-9]{8,}[0-9Xx]$/;

// Java 21 Locale.getISOLanguages(), including the aliases accepted by the backend.
const languages = new Set(
  (
    `aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy ` +
    `da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ` +
    `ia id ie ig ii ik in io is it iu iw ja ji jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg ` +
    `li ln lo lt lu lv mg mh mi mk ml mn mo mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or ` +
    `os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te ` +
    `tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu`
  ).split(' '),
);

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
  return /^[A-Za-z]{2}$/.test(value) && languages.has(value.toLowerCase())
    ? null
    : { language: true };
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
