import { ReadingStatus } from '../../books/models/book.models';

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

export interface SagaVolumeBook {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
  readingStatus: ReadingStatus;
  rating: number | null;
  finishedOn: string | null;
}

export interface SagaVolume {
  id: number;
  position: number;
  volumeLabel: string | null;
  bookId: number | null;
  book: SagaVolumeBook | null;
  pendingTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SagaVolumesResponse {
  /** Canonical decimal string for all volume writes. */
  revision: string;
  progress: SagaProgress;
  volumes: SagaVolume[];
}

export interface AddSagaVolumeRequest {
  bookId?: number | null;
  pendingTitle?: string | null;
  volumeLabel?: string | null;
  expectedRevision: string;
}

export interface UpdateSagaVolumeRequest {
  volumeLabel?: string | null;
  pendingTitle?: string | null;
  expectedRevision: string;
}

export interface LinkSagaVolumeRequest {
  bookId: number;
  expectedRevision: string;
}

export interface UnlinkSagaVolumeRequest {
  pendingTitle?: string | null;
  expectedRevision: string;
}

export interface MoveSagaVolumeRequest {
  toPosition: number;
  expectedRevision: string;
}

export interface SagaVolumeMutationResponse {
  revision: string;
  volume: SagaVolume;
}

export interface SagaVolumeMoveResponse {
  revision: string;
  volumeId: number;
  position: number;
}

export interface SagaRevisionResponse {
  revision: string;
}
