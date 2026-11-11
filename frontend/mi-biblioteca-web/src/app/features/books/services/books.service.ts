import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/config/api.config';
import { BookFilters, appendBookFilters } from '../models/book-filters';
import {
  MetadataWorks,
  MetadataEditions,
  MetadataDuplicates,
} from '../models/book-metadata.models';
import {
  BookPageResponse,
  BookLookupResponse,
  BookRequest,
  BookResponse,
  BookSearchRequest,
  BooksPageRequest,
  ReadingStatus,
  UpdateReadingStatusRequest,
  UpdateRatingRequest,
  ReadingDateRequest,
  UpdateReadingDatesRequest,
} from '../models/book.models';

@Injectable({ providedIn: 'root' })
export class BooksService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  searchMetadata(title: string, author: string, language?: string): Observable<MetadataWorks> {
    let params = new HttpParams();
    if (language !== undefined) params = params.set('smart', true).set('language', language);
    if (title.trim()) params = params.set('title', title.trim());
    if (author.trim()) params = params.set('author', author.trim());
    return this.http.get<MetadataWorks>(`${this.apiConfig.apiBaseUrl}/books/metadata-search`, {
      params,
    });
  }

  metadataEditions(
    workKey: string,
    page = 0,
    filters?: Record<string, string>,
  ): Observable<MetadataEditions> {
    let params = new HttpParams().set('workKey', workKey).set('page', page);
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value.trim()) params = params.set(key, value.trim());
    }
    return this.http.get<MetadataEditions>(`${this.apiConfig.apiBaseUrl}/books/metadata-editions`, {
      params,
    });
  }

  metadataDuplicates(isbn: string, title: string, author: string): Observable<MetadataDuplicates> {
    let params = new HttpParams();
    if (isbn.trim()) params = params.set('isbn', isbn);
    if (title.trim()) params = params.set('title', title.trim());
    if (author.trim()) params = params.set('author', author.trim());
    return this.http.get<MetadataDuplicates>(
      `${this.apiConfig.apiBaseUrl}/books/metadata-duplicates`,
      { params },
    );
  }

  uploadCover(id: number, file: File): Observable<BookResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<BookResponse>(`${this.apiConfig.apiBaseUrl}/books/${id}/cover`, formData);
  }

  deleteCover(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiConfig.apiBaseUrl}/books/${id}/cover`);
  }

  lookupByIsbn(isbn: string): Observable<BookLookupResponse> {
    const params = new HttpParams().set('isbn', isbn);
    return this.http.get<BookLookupResponse>(`${this.apiConfig.apiBaseUrl}/books/isbn-lookup`, {
      params,
    });
  }

  startReading(id: number, request: ReadingDateRequest): Observable<BookResponse> {
    return this.http.post<BookResponse>(
      `${this.apiConfig.apiBaseUrl}/books/${id}/start-reading`,
      request,
    );
  }

  finishReading(id: number, request: ReadingDateRequest): Observable<BookResponse> {
    return this.http.post<BookResponse>(
      `${this.apiConfig.apiBaseUrl}/books/${id}/finish-reading`,
      request,
    );
  }

  updateReadingDates(id: number, request: UpdateReadingDatesRequest): Observable<BookResponse> {
    return this.http.put<BookResponse>(
      `${this.apiConfig.apiBaseUrl}/books/${id}/reading-dates`,
      request,
    );
  }

  deleteReadingDates(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiConfig.apiBaseUrl}/books/${id}/reading-dates`);
  }

  updateReadingStatus(id: number, status: ReadingStatus): Observable<BookResponse> {
    const request: UpdateReadingStatusRequest = { readingStatus: status };
    return this.http.patch<BookResponse>(
      `${this.apiConfig.apiBaseUrl}/books/${id}/reading-status`,
      request,
    );
  }

  updateRating(id: number, rating: number): Observable<BookResponse> {
    const request: UpdateRatingRequest = { rating };
    return this.http.put<BookResponse>(`${this.apiConfig.apiBaseUrl}/books/${id}/rating`, request);
  }

  deleteRating(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiConfig.apiBaseUrl}/books/${id}/rating`);
  }

  deleteBook(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiConfig.apiBaseUrl}/books/${id}`);
  }

  getBook(id: number): Observable<BookResponse> {
    return this.http.get<BookResponse>(`${this.apiConfig.apiBaseUrl}/books/${id}`);
  }

  /** Distinct genres currently used by the catalog; no book list is downloaded. */
  getGenres(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiConfig.apiBaseUrl}/books/genres`);
  }

  updateBook(id: number, request: BookRequest): Observable<BookResponse> {
    return this.http.put<BookResponse>(`${this.apiConfig.apiBaseUrl}/books/${id}`, request);
  }

  createBook(request: BookRequest): Observable<BookResponse> {
    return this.http.post<BookResponse>(`${this.apiConfig.apiBaseUrl}/books`, request);
  }

  getBooks(
    options: BooksPageRequest = {},
    filters: BookFilters = {},
  ): Observable<BookPageResponse> {
    let params = new HttpParams({
      fromObject: {
        page: options.page ?? 0,
        size: options.size ?? 20,
        sortBy: options.sortBy ?? 'title',
        direction: options.direction ?? 'ASC',
      },
    });
    params = appendBookFilters(params, filters);
    return this.http.get<BookPageResponse>(`${this.apiConfig.apiBaseUrl}/books`, { params });
  }

  searchBooks(
    criteria: BookSearchRequest,
    options: BooksPageRequest = {},
    filters: BookFilters = {},
  ): Observable<BookPageResponse> {
    let params = new HttpParams({
      fromObject: {
        page: options.page ?? 0,
        size: options.size ?? 20,
        sortBy: options.sortBy ?? 'title',
        direction: options.direction ?? 'ASC',
      },
    });
    for (const field of ['title', 'author', 'isbn'] as const) {
      const value = criteria[field];
      if (value !== undefined && value.trim() !== '') params = params.set(field, value);
    }
    params = appendBookFilters(params, filters);
    return this.http.get<BookPageResponse>(`${this.apiConfig.apiBaseUrl}/books/search`, { params });
  }
}
