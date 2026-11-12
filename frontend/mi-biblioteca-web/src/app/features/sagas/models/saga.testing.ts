import {
  SagaPageResponse,
  SagaProgress,
  SagaRequest,
  SagaResponse,
  SagaVolume,
  SagaVolumeBook,
  SagaVolumesResponse,
} from './saga.models';

export function testSagaProgress(overrides: Partial<SagaProgress> = {}): SagaProgress {
  return {
    total: 5,
    linked: 3,
    pending: 2,
    read: 1,
    reading: 1,
    toRead: 1,
    abandoned: 0,
    ...overrides,
  };
}

export function testSaga(overrides: Partial<SagaResponse> = {}): SagaResponse {
  return {
    id: 1,
    name: 'Saga de prueba',
    author: 'Autora de prueba',
    description: 'Descripción de la saga',
    imageUrl: null,
    revision: '0',
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    progress: testSagaProgress(),
    ...overrides,
  };
}

export function testSagaPage(overrides: Partial<SagaPageResponse> = {}): SagaPageResponse {
  return {
    content: [testSaga()],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
    ...overrides,
  };
}

export function testSagaRequest(overrides: Partial<SagaRequest> = {}): SagaRequest {
  return {
    name: 'Saga de prueba',
    author: null,
    description: null,
    imageUrl: null,
    ...overrides,
  };
}

export function testSagaVolumeBook(overrides: Partial<SagaVolumeBook> = {}): SagaVolumeBook {
  return {
    id: 10,
    title: 'Libro vinculado',
    author: 'Autora del libro',
    coverUrl: null,
    readingStatus: 'READ',
    rating: 4,
    finishedOn: '2026-10-01',
    ...overrides,
  };
}

export function testSagaVolume(overrides: Partial<SagaVolume> = {}): SagaVolume {
  const book = testSagaVolumeBook();
  return {
    id: 100,
    position: 1,
    volumeLabel: '1',
    bookId: book.id,
    book,
    pendingTitle: null,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

export function testSagaVolumes(overrides: Partial<SagaVolumesResponse> = {}): SagaVolumesResponse {
  return {
    revision: '1',
    progress: testSagaProgress({
      total: 1,
      linked: 1,
      pending: 0,
      read: 1,
      reading: 0,
      toRead: 0,
      abandoned: 0,
    }),
    volumes: [testSagaVolume()],
    ...overrides,
  };
}

export function testPendingSagaVolume(overrides: Partial<SagaVolume> = {}): SagaVolume {
  return testSagaVolume({
    id: 200,
    position: 2,
    volumeLabel: '0.5',
    bookId: null,
    book: null,
    pendingTitle: 'Volumen pendiente',
    ...overrides,
  });
}
