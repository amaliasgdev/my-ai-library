export type ReadingStatus = 'TO_READ' | 'READING' | 'READ' | 'ABANDONED';

export interface BookRequest {
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  coverUrl: string | null;
  publisher: string | null;
  publicationYear: number | null;
  pageCount: number | null;
  language: string | null;
  genres: string[];
}

export interface BookResponse {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  coverUrl: string | null;
  publisher: string | null;
  publicationYear: number | null;
  pageCount: number | null;
  language: string | null;
  genres: string[];
  createdAt: string;
  updatedAt: string;
  readingStatus: ReadingStatus;
  rating: number | null;
  startedOn: string | null;
  finishedOn: string | null;
}

export interface BookPageResponse {
  content: BookResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type BookSortBy =
  | 'id'
  | 'title'
  | 'author'
  | 'createdAt'
  | 'updatedAt'
  | 'readingStatus'
  | 'rating'
  | 'startedOn'
  | 'finishedOn';

export interface BooksPageRequest {
  page?: number;
  size?: number;
  sortBy?: BookSortBy;
  direction?: 'ASC' | 'DESC';
}
