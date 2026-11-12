import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/config/api.config';
import {
  AddSagaVolumeRequest,
  BookSagaMembership,
  LinkSagaVolumeRequest,
  MoveSagaVolumeRequest,
  SagaListOptions,
  SagaPageResponse,
  SagaRequest,
  SagaResponse,
  SagaRevisionResponse,
  SagaVolumeMoveResponse,
  SagaVolumeMutationResponse,
  SagaVolumesResponse,
  UnlinkSagaVolumeRequest,
  UpdateSagaVolumeRequest,
} from '../models/saga.models';

@Injectable({ providedIn: 'root' })
export class SagasService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);
  private readonly url = `${this.apiConfig.apiBaseUrl}/sagas`;

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

  getBookSagas(bookId: number): Observable<BookSagaMembership[]> {
    return this.http.get<BookSagaMembership[]>(
      `${this.apiConfig.apiBaseUrl}/books/${bookId}/sagas`,
    );
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

  getVolumes(sagaId: number): Observable<SagaVolumesResponse> {
    return this.http.get<SagaVolumesResponse>(`${this.url}/${sagaId}/volumes`);
  }

  addVolume(sagaId: number, request: AddSagaVolumeRequest): Observable<SagaVolumeMutationResponse> {
    return this.http.post<SagaVolumeMutationResponse>(`${this.url}/${sagaId}/volumes`, request);
  }

  updateVolume(
    sagaId: number,
    volumeId: number,
    request: UpdateSagaVolumeRequest,
  ): Observable<SagaVolumeMutationResponse> {
    return this.http.put<SagaVolumeMutationResponse>(
      `${this.url}/${sagaId}/volumes/${volumeId}`,
      request,
    );
  }

  moveVolume(
    sagaId: number,
    volumeId: number,
    request: MoveSagaVolumeRequest,
  ): Observable<SagaVolumeMoveResponse> {
    return this.http.post<SagaVolumeMoveResponse>(
      `${this.url}/${sagaId}/volumes/${volumeId}/move`,
      request,
    );
  }

  deleteVolume(
    sagaId: number,
    volumeId: number,
    expectedRevision: string,
  ): Observable<SagaRevisionResponse> {
    return this.http.delete<SagaRevisionResponse>(`${this.url}/${sagaId}/volumes/${volumeId}`, {
      params: new HttpParams().set('expectedRevision', expectedRevision),
    });
  }

  linkVolume(
    sagaId: number,
    volumeId: number,
    request: LinkSagaVolumeRequest,
  ): Observable<SagaVolumeMutationResponse> {
    return this.http.post<SagaVolumeMutationResponse>(
      `${this.url}/${sagaId}/volumes/${volumeId}/link`,
      request,
    );
  }

  unlinkVolume(
    sagaId: number,
    volumeId: number,
    request: UnlinkSagaVolumeRequest,
  ): Observable<SagaVolumeMutationResponse> {
    return this.http.post<SagaVolumeMutationResponse>(
      `${this.url}/${sagaId}/volumes/${volumeId}/unlink`,
      request,
    );
  }
}
