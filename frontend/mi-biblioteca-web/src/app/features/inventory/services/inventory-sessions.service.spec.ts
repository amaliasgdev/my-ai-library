import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { InventorySessionsService } from './inventory-sessions.service';
import { testInventoryHistory, testInventorySession } from '../models/inventory.testing';

describe('InventorySessionsService', () => {
  let http: HttpTestingController;
  let service: InventorySessionsService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: '/custom' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(InventorySessionsService);
  });
  afterEach(() => http.verify());
  it('gets server history with only pagination and configured base; detail uses session identity', () => {
    service.history(3, 2, 50).subscribe();
    const req = http.expectOne('/custom/shelves/3/inventory-sessions?page=2&size=50');
    expect(req.request.method).toBe('GET');
    req.flush(testInventoryHistory());
    service.get(7).subscribe();
    http.expectOne('/custom/inventory-sessions/7').flush(testInventorySession());
  });
  it('creates with optional notes and replaces notes including explicit null', () => {
    service.create(3, null).subscribe();
    const req = http.expectOne('/custom/shelves/3/inventory-sessions');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ notes: null });
    req.flush(testInventorySession());
    service.notes(7, null).subscribe();
    const notes = http.expectOne('/custom/inventory-sessions/7/notes');
    expect(notes.request.method).toBe('PUT');
    expect(notes.request.body).toEqual({ notes: null });
    notes.flush(testInventorySession());
  });
  it.each(['complete', 'cancel'] as const)(
    '%s uses a bodyless POST and never retries',
    (action) => {
      service[action](7).subscribe({ error: () => undefined });
      const req = http.expectOne(`/custom/inventory-sessions/7/${action}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush({}, { status: 500, statusText: 'Error' });
      http.expectNone(() => true);
    },
  );
});
