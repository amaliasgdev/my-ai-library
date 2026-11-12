export type SagaSortBy = 'name' | 'author' | 'createdAt' | 'updatedAt';
export type SagaDirection = 'ASC' | 'DESC';

export interface SagaProgress {
  total: number;
  linked: number;
  pending: number;
  read: number;
  reading: number;
  toRead: number;
  abandoned: number;
}

export interface SagaRequest {
  name: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
}

export interface SagaResponse {
  id: number;
  name: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  /** Canonical decimal string: never converted to a JavaScript number. */
  revision: string;
  createdAt: string;
  updatedAt: string;
  progress: SagaProgress;
}

export interface SagaPageResponse {
  content: SagaResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SagaListOptions {
  page?: number;
  size?: number;
  sortBy?: SagaSortBy;
  direction?: SagaDirection;
  name?: string;
}
