import { SagaPageResponse, SagaProgress, SagaRequest, SagaResponse } from './saga.models';

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
