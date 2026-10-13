import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LocationsService } from './locations.service';
import { API_CONFIG } from '../../../core/config/api.config';
import { testLocations } from '../models/location.testing';

describe('LocationsService HTTP contract', () => {
  let service: LocationsService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: '/custom' } },
      ],
    });
    service = TestBed.inject(LocationsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads hierarchy without books or incoming-origin inference', () => {
    const next = vi.fn();
    service.getLocations().subscribe(next);
    const req = http.expectOne('/custom/locations');
    expect(req.request.method).toBe('GET');
    req.flush(testLocations());
    expect(next).toHaveBeenCalledWith(testLocations());
  });
  it.each(['rooms', 'bookcases', 'shelves'] as const)(
    'creates, renames and deletes %s without changing parent on rename',
    (level) => {
      service.create({ level, parentId: 2 }, ' Salón ').subscribe();
      const post = http.expectOne(`/custom/${level}`);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual(
        level === 'rooms'
          ? { name: ' Salón ' }
          : level === 'bookcases'
            ? { name: ' Salón ', roomId: 2 }
            : { name: ' Salón ', bookcaseId: 2 },
      );
      post.flush({ id: 3, name: 'Salón' });
      service.rename(level, 3, 'Other').subscribe();
      const put = http.expectOne(`/custom/${level}/3`);
      expect(put.request.body).toEqual({ name: 'Other' });
      expect(put.request.method).toBe('PUT');
      put.flush({ id: 3, name: 'Other' });
      service.delete(level, 3).subscribe();
      const del = http.expectOne(`/custom/${level}/3`);
      expect(del.request.method).toBe('DELETE');
      expect(del.request.body).toBeNull();
      del.flush(null);
    },
  );
});
