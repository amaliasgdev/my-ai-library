import { ParamMap, Params } from '@angular/router';

export const SAGA_PAGE_SIZES = [10, 20, 50, 100] as const;
export type SagaPageSize = (typeof SAGA_PAGE_SIZES)[number];

export interface SagaListQuery {
  /** Zero-based, matching the backend. */
  page: number;
  size: number;
  name: string;
}

export const DEFAULT_SAGA_LIST_QUERY: SagaListQuery = {
  page: 0,
  size: 20,
  name: '',
};

export function parseSagaListQuery(params: ParamMap): SagaListQuery {
  return {
    page: parsePage(params.get('page')),
    size: parseSize(params.get('size')),
    name: parseName(params.get('name')),
  };
}

export function serializeSagaListQuery(query: SagaListQuery): Params {
  const params: Params = {};
  if (query.page !== 0) params['page'] = String(query.page);
  if (query.size !== 20) params['size'] = String(query.size);
  if (query.name) params['name'] = query.name;
  return params;
}

export function isCanonicalSagaListQuery(params: ParamMap, query: SagaListQuery): boolean {
  const serialized = serializeSagaListQuery(query);
  const expectedKeys = Object.keys(serialized);
  if (params.keys.length !== expectedKeys.length) return false;
  return expectedKeys.every(
    (key) => params.getAll(key).length === 1 && params.get(key) === serialized[key],
  );
}

export function sameSagaListQuery(a: SagaListQuery, b: SagaListQuery): boolean {
  return a.page === b.page && a.size === b.size && a.name === b.name;
}

function parsePage(value: string | null): number {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return 0;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 0 && page <= 2147483647 ? page : 0;
}

function parseSize(value: string | null): number {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return 20;
  const size = Number(value);
  return (SAGA_PAGE_SIZES as readonly number[]).includes(size) ? size : 20;
}

function parseName(value: string | null): string {
  if (!value) return '';
  const name = value.trim();
  if (!name || name.length > 255 || /\p{Cc}/u.test(name)) return '';
  return name;
}
