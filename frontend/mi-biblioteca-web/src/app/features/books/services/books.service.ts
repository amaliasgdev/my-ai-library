import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/config/api.config';
import {
  BookPageResponse,
  BookRequest,
  BookResponse,
  BooksPageRequest,
} from '../models/book.models';

@Injectable({ providedIn: 'root' })
export class BooksService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

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
}
