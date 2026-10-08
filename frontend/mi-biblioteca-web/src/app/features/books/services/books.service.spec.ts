import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { BookPageResponse, BookResponse } from '../models/book.models';
import { testBook, testBookPage, testBookRequest } from '../models/book.testing';
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

  it('should GET an individual book by id and return BookResponse', () => {
    let result: BookResponse | undefined;
    service.getBook(42).subscribe((book) => (result = book));
    const request = http.expectOne('/api/books/42');
    expect(request.request.method).toBe('GET');
    request.flush(testBook({ id: 42 }));
    expect(result?.id).toBe(42);
  });

  it('should PUT the complete BookRequest unchanged and return BookResponse', () => {
    const body = testBookRequest({ genres: ['Aventura'], coverUrl: 'https://example.test/a%20b' });
    let result: BookResponse | undefined;
    service.updateBook(42, body).subscribe((book) => (result = book));
    const request = http.expectOne('/api/books/42');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    request.flush(testBook({ id: 42 }));
    expect(result?.id).toBe(42);
  });

  it.each(['GET', 'PUT'])('should propagate %s by-id errors unchanged', (method) => {
    let error: HttpErrorResponse | undefined;
    const observable =
      method === 'GET' ? service.getBook(42) : service.updateBook(42, testBookRequest());
    observable.subscribe({ error: (value: HttpErrorResponse) => (error = value) });
    const problem = { detail: 'Internal message', status: 404 };
    http.expectOne('/api/books/42').flush(problem, { status: 404, statusText: 'Not Found' });
    expect(error?.status).toBe(404);
    expect(error?.error).toEqual(problem);
  });

  it('should POST the complete BookRequest unchanged and return BookResponse', () => {
    const body = testBookRequest({ isbn: '978-0132350884', genres: ['Fantasía'] });
    let result: BookResponse | undefined;
    service.createBook(body).subscribe((book) => (result = book));
    const request = http.expectOne('/api/books');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(request.request.params.keys()).toEqual([]);
    const response = testBook();
    request.flush(response, { status: 201, statusText: 'Created' });
    expect(result).toEqual(response);
  });

  it('should propagate POST errors without replacing ProblemDetail', () => {
    let result: HttpErrorResponse | undefined;
    service
      .createBook(testBookRequest())
      .subscribe({ error: (error: HttpErrorResponse) => (result = error) });
    const problem = { status: 409, detail: 'Duplicate ISBN' };
    http.expectOne('/api/books').flush(problem, { status: 409, statusText: 'Conflict' });
    expect(result?.status).toBe(409);
    expect(result?.error).toEqual(problem);
  });

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
    const body = testBookRequest();
    TestBed.inject(BooksService).createBook(body).subscribe();
    const request = http.expectOne('/alternative-api/books');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush(testBook());
    TestBed.inject(BooksService).getBook(42).subscribe();
    const get = http.expectOne('/alternative-api/books/42');
    expect(get.request.method).toBe('GET');
    get.flush(testBook({ id: 42 }));
    TestBed.inject(BooksService).updateBook(42, body).subscribe();
    const put = http.expectOne('/alternative-api/books/42');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual(body);
    put.flush(testBook({ id: 42 }));
    http.verify();
  });
});
