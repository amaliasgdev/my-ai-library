import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../core/config/api.config';
import { ReadingListService } from './reading-list.service';

describe('ReadingListService', () => {
  let service: ReadingListService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: '/custom' } },
      ],
    });
    service = TestBed.inject(ReadingListService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('queries the full list without pagination and uses the configured base URL', () => {
    service.getList().subscribe();
    const request = http.expectOne('/custom/reading-list');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ revision: '9223372036854775807', totalItems: 0, items: [] });
  });

  it('serializes the backend status filter', () => {
    service.getList('READ').subscribe();
    const request = http.expectOne('/custom/reading-list?readingStatus=READ');
    expect(request.request.method).toBe('GET');
    request.flush({ revision: '0', totalItems: 0, items: [] });
  });

  it('sends absolute moves with the original decimal string revision', () => {
    service.move(12, 3, '9223372036854775806').subscribe();
    const request = http.expectOne('/custom/reading-list/items/12/move');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      toPosition: 3,
      expectedRevision: '9223372036854775806',
    });
    request.flush({ revision: '9223372036854775807', entryId: 12, position: 3 });
  });

  it('removes an entry with a bodyless DELETE, never a Book', () => {
    service.remove(12, '5').subscribe();
    const request = http.expectOne('/custom/reading-list/items/12?expectedRevision=5');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush({ revision: '6' });
  });

  it('sends unique membership IDs as repeated query parameters in one GET', () => {
    service.membership([1, 42, 1]).subscribe();
    const request = http.expectOne('/custom/reading-list/membership?bookId=1&bookId=42');
    expect(request.request.method).toBe('GET');
    request.flush({ revision: '5', items: [] });
  });

  it('adds using a JSON string revision without precision loss', () => {
    service.add(42, '9223372036854775806').subscribe();
    const request = http.expectOne('/custom/reading-list/items');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ bookId: 42, expectedRevision: '9223372036854775806' });
    request.flush({ revision: '9223372036854775807', item: { entryId: 9 } });
  });
});
