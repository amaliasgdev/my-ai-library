import { BookPageResponse, BookRequest, BookResponse } from './book.models';

export function testBookRequest(overrides: Partial<BookRequest> = {}): BookRequest {
  return {
    title: 'Libro de prueba',
    author: 'Autora de prueba',
    isbn: null,
    description: null,
    coverUrl: null,
    publisher: null,
    publicationYear: null,
    pageCount: null,
    language: null,
    genres: [],
    ...overrides,
  };
}

// Offline fixtures for unit tests only; never used by the application.
export function testBook(overrides: Partial<BookResponse> = {}): BookResponse {
  return {
    id: 1,
    title: 'Libro de prueba',
    author: 'Autora de prueba',
    isbn: null,
    description: null,
    coverUrl: null,
    publisher: null,
    publicationYear: null,
    pageCount: null,
    language: null,
    genres: [],
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    readingStatus: 'TO_READ',
    rating: null,
    startedOn: null,
    finishedOn: null,
    ...overrides,
  };
}

export function testBookPage(overrides: Partial<BookPageResponse> = {}): BookPageResponse {
  return {
    content: [testBook()],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
    ...overrides,
  };
}
