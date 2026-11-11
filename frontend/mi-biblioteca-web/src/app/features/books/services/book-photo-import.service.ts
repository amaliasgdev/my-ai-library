import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_CONFIG } from '../../../core/config/api.config';
import {
  PhotoImportCapabilities,
  PhotoRecognitionResponse,
} from '../models/book-photo-import.models';

@Injectable({ providedIn: 'root' })
export class BookPhotoImportService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_CONFIG).apiBaseUrl}/book-photo-import`;

  capabilities() {
    return this.http.get<PhotoImportCapabilities>(`${this.url}/capabilities`);
  }

  recognize(file: File, rotation: 0 | 90 | 180 | 270) {
    const body = new FormData();
    body.append('file', file);
    body.append('rotation', String(rotation));
    return this.http.post<PhotoRecognitionResponse>(`${this.url}/recognize`, body);
  }
}
