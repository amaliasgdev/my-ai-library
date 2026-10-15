import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/config/api.config';
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

  updateBook(id: number, request: BookRequest): Observable<BookResponse> {
    return this.http.put<BookResponse>(`${this.apiConfig.apiBaseUrl}/books/${id}`, request);
  }

  createBook(request: BookRequest): Observable<BookResponse> {
    return this.http.post<BookResponse>(`${this.apiConfig.apiBaseUrl}/books`, request);
  }

  getBooks(options: BooksPageRequest = {}): Observable<BookPageResponse> {
    const params = new HttpParams({
      fromObject: {
        page: options.page ?? 0,
        size: options.size ?? 20,
        sortBy: options.sortBy ?? 'title',
        direction: options.direction ?? 'ASC',
      },
    });
    return this.http.get<BookPageResponse>(`${this.apiConfig.apiBaseUrl}/books`, { params });
  }

  searchBooks(
    criteria: BookSearchRequest,
    options: BooksPageRequest = {},
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
    return this.http.get<BookPageResponse>(`${this.apiConfig.apiBaseUrl}/books/search`, { params });
  }
}
