import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_CONFIG } from '../../core/config/api.config';
import { ReadingStatus } from '../books/models/book.models';
import { ReadingListMoveResponse, ReadingListResponse } from './reading-list.models';

@Injectable({ providedIn: 'root' })
export class ReadingListService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_CONFIG).apiBaseUrl}/reading-list`;

  getList(status: ReadingStatus | null = null) {
    const params = status ? new HttpParams().set('readingStatus', status) : new HttpParams();
    return this.http.get<ReadingListResponse>(this.url, { params });
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
