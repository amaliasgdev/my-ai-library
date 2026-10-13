import { BookRequest, BookResponse } from '../../models/book.models';

export interface BookFormValue {
  title: string;
  author: string;
  isbn: string;
  description: string;
  coverUrl: string;
  publisher: string;
  publicationYear: number | null;
  pageCount: number | null;
  language: string;
  genres: string[];
  room: string;
  bookcase: string;
  shelf: string;
  shelfId?: number | null;
}

export function bookFormValue(book: BookResponse): BookFormValue {
  return {
    title: book.title,
    author: book.author,
    isbn: book.isbn ?? '',
    description: book.description ?? '',
    coverUrl: book.coverUrl ?? '',
    publisher: book.publisher ?? '',
    publicationYear: book.publicationYear,
    pageCount: book.pageCount,
    language: book.language ?? '',
    genres: [...book.genres],
    room: book.room ?? '',
    bookcase: book.bookcase ?? '',
    shelf: book.shelf ?? '',
    shelfId: book.shelfId ?? null,
  };
}

export function buildBookRequest(value: BookFormValue): BookRequest {
  const optional = (text: string): string | null => (text.trim() ? text : null);
  const request: BookRequest = {
    title: value.title,
    author: value.author,
    isbn: optional(value.isbn),
    description: optional(value.description),
    coverUrl: value.coverUrl === '' ? null : value.coverUrl,
    publisher: optional(value.publisher.trim()),
    publicationYear: value.publicationYear,
    pageCount: value.pageCount,
    language: optional(value.language.toLowerCase()),
    genres: value.genres.map((genre) => genre.trim()),
    room: optional(value.room.trim()),
    bookcase: optional(value.bookcase.trim()),
    shelf: optional(value.shelf.trim()),
  };
  if (value.shelfId != null) {
    delete request.room;
    delete request.bookcase;
    delete request.shelf;
    request.location = { kind: 'SHELF', shelfId: value.shelfId };
  }
  return request;
}
