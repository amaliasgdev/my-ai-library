import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/config/api.config';
import {
  SagaListOptions,
  SagaPageResponse,
  SagaRequest,
  SagaResponse,
} from '../models/saga.models';

@Injectable({ providedIn: 'root' })
export class SagasService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_CONFIG).apiBaseUrl}/sagas`;

  getSagas(options: SagaListOptions = {}): Observable<SagaPageResponse> {
    let params = new HttpParams()
      .set('page', options.page ?? 0)
      .set('size', options.size ?? 20)
      .set('sortBy', options.sortBy ?? 'name')
      .set('direction', options.direction ?? 'ASC');
    const name = options.name?.trim();
    if (name) params = params.set('name', name);
    return this.http.get<SagaPageResponse>(this.url, { params });
  }

  getSaga(id: number): Observable<SagaResponse> {
    return this.http.get<SagaResponse>(`${this.url}/${id}`);
  }

  createSaga(request: SagaRequest): Observable<SagaResponse> {
    return this.http.post<SagaResponse>(this.url, request);
  }

  updateSaga(id: number, request: SagaRequest, expectedRevision: string): Observable<SagaResponse> {
    return this.http.put<SagaResponse>(`${this.url}/${id}`, request, {
      params: new HttpParams().set('expectedRevision', expectedRevision),
    });
  }

  deleteSaga(id: number, expectedRevision: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`, {
      params: new HttpParams().set('expectedRevision', expectedRevision),
    });
  }
}
