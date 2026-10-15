import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_CONFIG } from '../../../core/config/api.config';
import {
  ReconciliationAssigned,
  ReconciliationAssign,
  ReconciliationDetail,
  ReconciliationPage,
  ReconciliationType,
} from '../models/reconciliation.models';

@Injectable({ providedIn: 'root' })
export class ReconciliationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).apiBaseUrl}/locations/reconciliation`;
  groups(page: number, size: number, type: ReconciliationType, text: string) {
    let params = new HttpParams().set('page', page).set('size', size).set('type', type);
    if (text.trim()) params = params.set('text', text.trim());
    return this.http.get<ReconciliationPage>(this.base, { params });
  }
  detail(key: string, page = 0, size = 20) {
    return this.http.get<ReconciliationDetail>(`${this.base}/${encodeURIComponent(key)}`, {
      params: new HttpParams().set('page', page).set('size', size),
    });
  }
  assign(request: ReconciliationAssign) {
    return this.http.post<ReconciliationAssigned>(`${this.base}/assign`, request);
  }
}
