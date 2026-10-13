import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_CONFIG } from '../../../core/config/api.config';
import { LocationCreation, LocationItem, LocationLevel, RoomNode } from '../models/location.models';

@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).apiBaseUrl}`;
  getLocations() {
    return this.http.get<RoomNode[]>(`${this.base}/locations`);
  }
  create(request: LocationCreation, name: string) {
    const body =
      request.level === 'rooms'
        ? { name }
        : request.level === 'bookcases'
          ? { name, roomId: request.parentId }
          : { name, bookcaseId: request.parentId };
    return this.http.post<LocationItem>(`${this.base}/${request.level}`, body);
  }
  rename(level: LocationLevel, id: number, name: string) {
    return this.http.put<LocationItem>(`${this.base}/${level}/${id}`, { name });
  }
  delete(level: LocationLevel, id: number) {
    return this.http.delete<void>(`${this.base}/${level}/${id}`);
  }
}
