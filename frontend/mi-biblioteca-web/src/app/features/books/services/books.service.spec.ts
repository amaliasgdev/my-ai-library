import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { BookPageResponse } from '../models/book.models';
import { testBookPage } from '../models/book.testing';
import { BooksService } from './books.service';

describe('BooksService', () => {
  let http: HttpTestingController;
  let service: BooksService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(BooksService);
  });

  afterEach(() => http.verify());

  it('should GET /api/books with all default parameters and return the page', () => {
    let result: BookPageResponse | undefined;
    service.getBooks().subscribe((page) => (result = page));
    const request = http.expectOne((req) => req.url === '/api/books');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['direction', 'page', 'size', 'sortBy']);
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('title');
    expect(request.request.params.get('direction')).toBe('ASC');
    const response = testBookPage();
    request.flush(response);
    expect(result).toEqual(response);
  });

  it('should send custom pagination and sorting parameters', () => {
    service.getBooks({ page: 2, size: 50, sortBy: 'rating', direction: 'DESC' }).subscribe();
    const request = http.expectOne((req) => req.url === '/api/books');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('50');
    expect(request.request.params.get('sortBy')).toBe('rating');
    expect(request.request.params.get('direction')).toBe('DESC');
    request.flush(testBookPage({ page: 2, size: 50 }));
  });

  it('should use defaults for omitted options', () => {
    service.getBooks({ page: 1 }).subscribe();
    const request = http.expectOne((req) => req.url === '/api/books');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('title');
    expect(request.request.params.get('direction')).toBe('ASC');
    request.flush(testBookPage({ page: 1 }));
  });

  it('should propagate the HTTP error without replacing ProblemDetail', () => {
    let result: HttpErrorResponse | undefined;
    service.getBooks().subscribe({ error: (error: HttpErrorResponse) => (result = error) });
    const problem = { status: 400, detail: 'Invalid page' };
    http
      .expectOne((req) => req.url === '/api/books')
      .flush(problem, {
        status: 400,
        statusText: 'Bad Request',
      });
    expect(result?.status).toBe(400);
    expect(result?.error).toEqual(problem);
  });
});

describe('BooksService with alternative API_CONFIG', () => {
  it('should respect the injected base URL', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: '/alternative-api' } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(BooksService).getBooks().subscribe();
    http.expectOne((req) => req.url === '/alternative-api/books').flush(testBookPage());
    http.verify();
  });
});
