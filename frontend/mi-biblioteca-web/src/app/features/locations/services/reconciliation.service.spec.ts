import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { ReconciliationService } from './reconciliation.service';
import { testReconciliationDetail, testReconciliationPage } from '../models/reconciliation.testing';

describe('ReconciliationService', () => {
  let http: HttpTestingController;
  let service: ReconciliationService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: '/custom' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ReconciliationService);
  });
  afterEach(() => http.verify());
  it('lists with explicit applied criteria and configured API base, never writes', () => {
    service.groups(2, 50, 'PARTIAL', ' Salón ').subscribe();
    const req = http.expectOne((r) => r.url === '/custom/locations/reconciliation');
    expect(req.request.params.keys()).toEqual(['page', 'size', 'type', 'text']);
    expect(req.request.params.get('text')).toBe('Salón');
    expect(req.request.params.get('page')).toBe('2');
    req.flush(testReconciliationPage());
  });
  it('omits blank text and encodes an opaque group key for lazy detail pagination', () => {
    service.groups(0, 20, 'ALL', ' ').subscribe();
    const list = http.expectOne((r) => r.url === '/custom/locations/reconciliation');
    expect(list.request.params.has('text')).toBe(false);
    list.flush(testReconciliationPage());
    service.detail('a/b+', 3, 10).subscribe();
    const req = http.expectOne((r) => r.url === '/custom/locations/reconciliation/a%2Fb%2B');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('size')).toBe('10');
    req.flush(testReconciliationDetail());
  });
  it('POST sends only signed review, stable Shelf identity and expected human labels', () => {
    const request = {
      reviewToken: 'opaque.signed',
      shelfId: 3,
      expectedDestination: { room: 'Salón', bookcase: 'Billy', shelf: '1' },
    };
    service.assign(request).subscribe();
    const req = http.expectOne('/custom/locations/reconciliation/assign');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ affectedCount: 2, shelfId: 3 });
  });
});
