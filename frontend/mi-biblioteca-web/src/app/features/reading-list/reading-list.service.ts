import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_CONFIG } from '../../core/config/api.config';
import { ReadingStatus } from '../books/models/book.models';
import {
  ReadingListMembershipResponse,
  ReadingListMoveResponse,
  ReadingListResponse,
  ReadingListItem,
} from './reading-list.models';

@Injectable({ providedIn: 'root' })
export class ReadingListService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_CONFIG).apiBaseUrl}/reading-list`;

  getList(status: ReadingStatus | null = null) {
    const params = status ? new HttpParams().set('readingStatus', status) : new HttpParams();
    return this.http.get<ReadingListResponse>(this.url, { params });
  }

  membership(bookIds: readonly number[]) {
    let params = new HttpParams();
    for (const id of new Set(bookIds)) params = params.append('bookId', id);
    return this.http.get<ReadingListMembershipResponse>(`${this.url}/membership`, { params });
  }

  add(bookId: number, expectedRevision: string) {
    return this.http.post<{ revision: string; item: ReadingListItem }>(`${this.url}/items`, {
      bookId,
      expectedRevision,
    });
  }

  move(entryId: number, toPosition: number, expectedRevision: string) {
    return this.http.post<ReadingListMoveResponse>(`${this.url}/items/${entryId}/move`, {
      toPosition,
      expectedRevision,
    });
  }

  remove(entryId: number, expectedRevision: string) {
    return this.http.delete<{ revision: string }>(`${this.url}/items/${entryId}`, {
      params: new HttpParams().set('expectedRevision', expectedRevision),
    });
  }
}
