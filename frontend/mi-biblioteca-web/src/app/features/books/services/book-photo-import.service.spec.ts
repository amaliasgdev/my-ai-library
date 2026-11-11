import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { testPhotoCapabilities, testPhotoResult } from '../models/book-photo-import.testing';
import { BookPhotoImportService } from './book-photo-import.service';

describe('BookPhotoImportService', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: '/test-api' } },
      ],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads availability from configured API without uploading a photograph', () => {
    const expected = testPhotoCapabilities();
    const received = vi.fn();
    TestBed.inject(BookPhotoImportService).capabilities().subscribe(received);
    const req = TestBed.inject(HttpTestingController).expectOne(
      '/test-api/book-photo-import/capabilities',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.body).toBeNull();
    req.flush(expected);
    expect(received).toHaveBeenCalledWith(expected);
  });

  it('sends original file and rotation separately, without setting multipart Content-Type', () => {
    const file = new File(['image'], 'local.jpg', { type: 'image/jpeg' });
    const received = vi.fn();
    TestBed.inject(BookPhotoImportService).recognize(file, 90).subscribe(received);
    const req = TestBed.inject(HttpTestingController).expectOne(
      '/test-api/book-photo-import/recognize',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body.get('file')).toBe(file);
    expect(req.request.body.get('rotation')).toBe('90');
    expect(Array.from((req.request.body as FormData).keys())).toEqual(['file', 'rotation']);
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush(testPhotoResult());
    expect(received).toHaveBeenCalledWith(testPhotoResult());
  });

  it('never automatically retries an analysis error', () => {
    const failed = vi.fn();
    TestBed.inject(BookPhotoImportService)
      .recognize(new File(['x'], 'photo.png'), 0)
      .subscribe({ error: failed });
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/test-api/book-photo-import/recognize')
      .flush({}, { status: 504, statusText: 'Timeout' });
    expect(failed).toHaveBeenCalledOnce();
    http.expectNone('/test-api/book-photo-import/recognize');
  });
});
