import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_CONFIG } from '../../../core/config/api.config';
import {
  InventorySessionResponse,
  ShelfInventorySessionsResponse,
} from '../models/inventory-session.models';

@Injectable({ providedIn: 'root' })
export class InventorySessionsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_CONFIG).apiBaseUrl;
  history(shelfId: number, page: number, size: number) {
    return this.http.get<ShelfInventorySessionsResponse>(
      `${this.base}/shelves/${shelfId}/inventory-sessions`,
      { params: new HttpParams().set('page', page).set('size', size) },
    );
  }
  get(id: number) {
    return this.http.get<InventorySessionResponse>(`${this.base}/inventory-sessions/${id}`);
  }
  create(shelfId: number, notes: string | null) {
    return this.http.post<InventorySessionResponse>(
      `${this.base}/shelves/${shelfId}/inventory-sessions`,
      { notes },
    );
  }
  complete(id: number) {
    return this.http.post<InventorySessionResponse>(
      `${this.base}/inventory-sessions/${id}/complete`,
      null,
    );
  }
  cancel(id: number) {
    return this.http.post<InventorySessionResponse>(
      `${this.base}/inventory-sessions/${id}/cancel`,
      null,
    );
  }
  notes(id: number, notes: string | null) {
    return this.http.put<InventorySessionResponse>(`${this.base}/inventory-sessions/${id}/notes`, {
      notes,
    });
  }
}
