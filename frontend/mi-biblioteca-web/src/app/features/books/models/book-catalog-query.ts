import { ParamMap, Params } from '@angular/router';
import { BookCatalogSort, BookSearchRequest } from './book.models';
import { CRUD_ISBN_PATTERN } from './isbn-pattern';

export interface BookCatalogQuery extends BookCatalogSort {
  page: number;
  size: number;
  search: BookSearchRequest | null;
}

export function parseBookCatalogQuery(params: ParamMap): BookCatalogQuery {
  const single = (key: string): string | null =>
    params.getAll(key).length === 1 ? params.get(key) : null;
  const text = (key: string, max: number): string | undefined => {
    const value = single(key)?.trim();
    return value && value.length <= max ? value : undefined;
  };
  const rawPage = single('page');
  const page = rawPage !== null && /^\d+$/.test(rawPage) ? Number(rawPage) : 0;
  const rawSize = single('size');
  const size =
    rawSize !== null && ['10', '20', '50', '100'].includes(rawSize) ? Number(rawSize) : 20;
  const rawSort = single('sortBy');
  const sortBy =
    (['title', 'author', 'createdAt', 'readingStatus', 'rating'] as const).find(
      (value) => value === rawSort,
    ) ?? 'title';
  const direction = single('direction') === 'DESC' ? 'DESC' : 'ASC';
  const isbn = text('isbn', 20);
  const search: BookSearchRequest = {};
  if (isbn && CRUD_ISBN_PATTERN.test(isbn)) search.isbn = isbn;
  else {
    const title = text('title', 255);
    const author = text('author', 255);
    if (title) search.title = title;
    if (author) search.author = author;
  }
  return {
    page: Number.isInteger(page) && page <= 2_147_483_647 ? page : 0,
    size,
    sortBy,
    direction,
    search: Object.keys(search).length ? search : null,
  };
}

export function serializeBookCatalogQuery(query: BookCatalogQuery): Params {
  const params: Params = {};
  if (query.page !== 0) params['page'] = String(query.page);
  if (query.size !== 20) params['size'] = String(query.size);
  if (query.sortBy !== 'title') params['sortBy'] = query.sortBy;
  if (query.direction !== 'ASC') params['direction'] = query.direction;
  if (query.search?.title) params['title'] = query.search.title;
  if (query.search?.author) params['author'] = query.search.author;
  if (query.search?.isbn) params['isbn'] = query.search.isbn;
  return params;
}

export function isCanonicalBookCatalogQuery(params: ParamMap, query: BookCatalogQuery): boolean {
  const canonical = serializeBookCatalogQuery(query);
  return (
    params.keys.length === Object.keys(canonical).length &&
    params.keys.every(
      (key) => params.getAll(key).length === 1 && params.get(key) === canonical[key],
    )
  );
}

export function sameBookCatalogQuery(a: BookCatalogQuery, b: BookCatalogQuery): boolean {
  return (
    a.page === b.page &&
    a.size === b.size &&
    a.sortBy === b.sortBy &&
    a.direction === b.direction &&
    sameBookSearch(a.search, b.search)
  );
}

export function sameBookSearch(a: BookSearchRequest | null, b: BookSearchRequest | null): boolean {
  return a?.title === b?.title && a?.author === b?.author && a?.isbn === b?.isbn;
}
