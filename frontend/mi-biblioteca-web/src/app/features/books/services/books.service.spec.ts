import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { BookPageResponse, BookResponse } from '../models/book.models';
import { testBook, testBookLookup, testBookPage, testBookRequest } from '../models/book.testing';
import { BooksService } from './books.service';
import { Observable } from 'rxjs';

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

  it('should POST the original File in exactly one multipart part without Content-Type', () => {
    const file = new File(['bytes'], 'original.gif', { type: 'image/png' });
    const next = vi.fn();
    service.uploadCover(42, file).subscribe(next);
    const request = http.expectOne('/api/books/42/cover');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect(Array.from((request.request.body as FormData).keys())).toEqual(['file']);
    expect(request.request.body.get('file')).toBe(file);
    expect(request.request.headers.has('Content-Type')).toBe(false);
    const response = testBook({
      id: 42,
      coverUrl: 'http://localhost:8081/api/covers/42-12345678-1234-abcd-1234-123456789abc.png',
    });
    request.flush(response);
    expect(next).toHaveBeenCalledExactlyOnceWith(response);
  });

  it('should DELETE cover without body and complete on 204', () => {
    const complete = vi.fn();
    service.deleteCover(42).subscribe({ complete });
    const request = http.expectOne('/api/books/42/cover');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(complete).toHaveBeenCalledOnce();
  });

  it.each(['upload', 'delete'])('should propagate %s cover failures', (action) => {
    const error = vi.fn();
    const response: Observable<BookResponse | void> =
      action === 'upload'
        ? service.uploadCover(42, new File(['a'], 'a.png', { type: 'image/png' }))
        : service.deleteCover(42);
    response.subscribe({ error });
    http
      .expectOne('/api/books/42/cover')
      .flush({ detail: 'PRIVATE' }, { status: 500, statusText: 'Error' });
    expect(error.mock.calls[0][0].status).toBe(500);
  });

  it('should GET the independent lookup response with the ISBN unchanged', () => {
    const next = vi.fn();
    const isbn = ' 978-0132350884 ';
    service.lookupByIsbn(isbn).subscribe(next);
    const request = http.expectOne((req) => req.url === '/api/books/isbn-lookup');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual(['isbn']);
    expect(request.request.params.get('isbn')).toBe(isbn);
    expect(request.request.body).toBeNull();
    const response = testBookLookup();
    request.flush(response);
    expect(next).toHaveBeenCalledExactlyOnceWith(response);
  });

  it.each([0, 400, 404, 502, 503, 504, 500])('should propagate lookup error %s', (status) => {
    const error = vi.fn();
    service.lookupByIsbn('1234567890').subscribe({ error });
    const request = http.expectOne((req) => req.url === '/api/books/isbn-lookup');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ detail: 'PRIVATE' }, { status, statusText: 'Error' });
    expect(error.mock.calls[0][0]).toBeInstanceOf(HttpErrorResponse);
    expect(error.mock.calls[0][0].status).toBe(status);
  });

  it.each(['start', 'finish'] as const)(
    'should POST %s reading with its exact date DTO and confirmed response',
    (action) => {
      const request = { date: '2026-10-12' };
      const next = vi.fn();
      (action === 'start'
        ? service.startReading(42, request)
        : service.finishReading(42, request)
      ).subscribe(next);
      const httpRequest = http.expectOne(`/api/books/42/${action}-reading`);
      expect(httpRequest.request.method).toBe('POST');
      expect(httpRequest.request.body).toEqual(request);
      const book = testBook({ id: 42, startedOn: request.date });
      httpRequest.flush(book);
      expect(next).toHaveBeenCalledWith(book);
    },
  );

  it.each([
    { startedOn: '2024-02-29', finishedOn: null },
    { startedOn: null, finishedOn: '2026-10-12' },
    { startedOn: '2026-10-12', finishedOn: '2026-10-12' },
  ])('should PUT both reading-date fields exactly: %j', (body) => {
    const next = vi.fn();
    service.updateReadingDates(42, body).subscribe(next);
    const request = http.expectOne('/api/books/42/reading-dates');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    const book = testBook({ id: 42, ...body });
    request.flush(book);
    expect(next).toHaveBeenCalledWith(book);
  });

  it('should DELETE reading dates without a body and complete on 204', () => {
    const complete = vi.fn();
    service.deleteReadingDates(42).subscribe({ complete });
    const request = http.expectOne('/api/books/42/reading-dates');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(complete).toHaveBeenCalledOnce();
  });

  it.each(['start', 'finish', 'update', 'delete'] as const)(
    'should propagate %s reading-date errors',
    (action) => {
      const error = vi.fn();
      const request: Observable<BookResponse | void> =
        action === 'start'
          ? service.startReading(42, { date: '2026-10-12' })
          : action === 'finish'
            ? service.finishReading(42, { date: '2026-10-12' })
            : action === 'update'
              ? service.updateReadingDates(42, { startedOn: null, finishedOn: '2026-10-12' })
              : service.deleteReadingDates(42);
      request.subscribe({ error });
      http
        .expectOne(
          `/api/books/42/${action === 'start' || action === 'finish' ? action + '-reading' : 'reading-dates'}`,
        )
        .flush({ detail: 'PRIVATE' }, { status: 400, statusText: 'Bad Request' });
      expect(error.mock.calls[0][0].status).toBe(400);
      expect(error.mock.calls[0][0].error).toEqual({ detail: 'PRIVATE' });
    },
  );

  it('should PATCH the exact reading status DTO and return BookResponse', () => {
    const next = vi.fn();
    service.updateReadingStatus(42, 'READING').subscribe(next);
    const request = http.expectOne('/api/books/42/reading-status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ readingStatus: 'READING' });
    const response = testBook({ id: 42, readingStatus: 'READING' });
    request.flush(response);
    expect(next).toHaveBeenCalledWith(response);
  });

  it('should PUT the exact numeric rating DTO and return BookResponse', () => {
    const next = vi.fn();
    service.updateRating(42, 4).subscribe(next);
    const request = http.expectOne('/api/books/42/rating');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ rating: 4 });
    const response = testBook({ id: 42, rating: 4 });
    request.flush(response);
    expect(next).toHaveBeenCalledWith(response);
  });

  it('should DELETE rating without a body and complete on 204', () => {
    const complete = vi.fn();
    service.deleteRating(42).subscribe({ complete });
    const request = http.expectOne('/api/books/42/rating');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(complete).toHaveBeenCalledOnce();
  });

  it.each(['status', 'rating', 'deleteRating'])(
    'should propagate %s errors unchanged',
    (action) => {
      const error = vi.fn();
      const request: Observable<BookResponse | void> =
        action === 'status'
          ? service.updateReadingStatus(42, 'READ')
          : action === 'rating'
            ? service.updateRating(42, 5)
            : service.deleteRating(42);
      request.subscribe({ error });
      const problem = { detail: 'Internal detail' };
      http
        .expectOne(action === 'status' ? '/api/books/42/reading-status' : '/api/books/42/rating')
        .flush(problem, { status: 404, statusText: 'Not Found' });
      expect(error.mock.calls[0][0].status).toBe(404);
      expect(error.mock.calls[0][0].error).toEqual(problem);
    },
  );

  it.each(['title', 'author', 'createdAt', 'readingStatus', 'rating'] as const)(
    'should send custom %s DESC sorting for both list and search',
    (sortBy) => {
      service.getBooks({ sortBy, direction: 'DESC' }).subscribe();
      const listing = http.expectOne((req) => req.url === '/api/books');
      expect(listing.request.params.get('sortBy')).toBe(sortBy);
      expect(listing.request.params.get('direction')).toBe('DESC');
      listing.flush(testBookPage());
      service.searchBooks({ title: 'Dune' }, { sortBy, direction: 'DESC' }).subscribe();
      const search = http.expectOne((req) => req.url === '/api/books/search');
      expect(search.request.params.get('sortBy')).toBe(sortBy);
      expect(search.request.params.get('direction')).toBe('DESC');
      expect(search.request.params.get('title')).toBe('Dune');
      search.flush(testBookPage());
    },
  );

  it.each([
    { title: 'Dune' },
    { author: 'Herbert' },
    { title: 'Dune', author: 'Herbert' },
    { isbn: '978-0-306-40615-7' },
  ])('should search by the supplied criteria %j with defaults', (criteria) => {
    const next = vi.fn();
    service.searchBooks(criteria).subscribe(next);
    const request = http.expectOne((req) => req.url === '/api/books/search');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('title');
    expect(request.request.params.get('direction')).toBe('ASC');
    for (const field of ['title', 'author', 'isbn'] as const) {
      expect(request.request.params.get(field)).toBe(criteria[field] ?? null);
    }
    request.flush(testBookPage());
    expect(next).toHaveBeenCalledWith(testBookPage());
  });

  it('should omit empty criteria and encode query text using HttpParams', () => {
    service
      .searchBooks(
        { title: 'A & B + C', author: ' ', isbn: '' },
        { page: 2, size: 50, sortBy: 'author', direction: 'DESC' },
      )
      .subscribe();
    const request = http.expectOne((req) => req.url === '/api/books/search');
    expect(request.request.params.keys().sort()).toEqual([
      'direction',
      'page',
      'size',
      'sortBy',
      'title',
    ]);
    expect(request.request.params.get('title')).toBe('A & B + C');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('50');
    expect(request.request.params.get('sortBy')).toBe('author');
    expect(request.request.params.get('direction')).toBe('DESC');
    request.flush(testBookPage());
  });

  it('should propagate search HTTP errors unchanged', () => {
    const error = vi.fn();
    service.searchBooks({ title: 'Dune' }).subscribe({ error });
    const problem = { detail: 'Internal detail' };
    http
      .expectOne((req) => req.url === '/api/books/search')
      .flush(problem, { status: 400, statusText: 'Bad Request' });
    expect(error.mock.calls[0][0].status).toBe(400);
    expect(error.mock.calls[0][0].error).toEqual(problem);
  });

  it('should DELETE by id without a body and complete on HTTP 204', () => {
    const next = vi.fn();
    const complete = vi.fn();
    service.deleteBook(42).subscribe({ next, complete });
    const request = http.expectOne('/api/books/42');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(next).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('should propagate DELETE errors unchanged', () => {
    let error: HttpErrorResponse | undefined;
    service.deleteBook(42).subscribe({ error: (value: HttpErrorResponse) => (error = value) });
    const problem = { status: 404, detail: 'Internal message' };
    http.expectOne('/api/books/42').flush(problem, { status: 404, statusText: 'Not Found' });
    expect(error?.status).toBe(404);
    expect(error?.error).toEqual(problem);
  });

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
    TestBed.inject(BooksService).lookupByIsbn('978-0132350884').subscribe();
    const lookup = http.expectOne((req) => req.url === '/alternative-api/books/isbn-lookup');
    expect(lookup.request.params.get('isbn')).toBe('978-0132350884');
    lookup.flush(testBookLookup());
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
    TestBed.inject(BooksService).deleteBook(42).subscribe();
    const deletion = http.expectOne('/alternative-api/books/42');
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    TestBed.inject(BooksService).searchBooks({ author: 'Herbert' }).subscribe();
    const search = http.expectOne((req) => req.url === '/alternative-api/books/search');
    expect(search.request.method).toBe('GET');
    expect(search.request.params.get('author')).toBe('Herbert');
    search.flush(testBookPage());
    TestBed.inject(BooksService).updateReadingStatus(42, 'READ').subscribe();
    const status = http.expectOne('/alternative-api/books/42/reading-status');
    expect(status.request.method).toBe('PATCH');
    expect(status.request.body).toEqual({ readingStatus: 'READ' });
    status.flush(testBook({ id: 42, readingStatus: 'READ' }));
    TestBed.inject(BooksService).updateRating(42, 3).subscribe();
    const rating = http.expectOne('/alternative-api/books/42/rating');
    expect(rating.request.method).toBe('PUT');
    expect(rating.request.body).toEqual({ rating: 3 });
    rating.flush(testBook({ id: 42, rating: 3 }));
    TestBed.inject(BooksService).deleteRating(42).subscribe();
    const clear = http.expectOne('/alternative-api/books/42/rating');
    expect(clear.request.method).toBe('DELETE');
    expect(clear.request.body).toBeNull();
    clear.flush(null, { status: 204, statusText: 'No Content' });
    const service = TestBed.inject(BooksService);
    service.uploadCover(42, new File(['a'], 'a.png', { type: 'image/png' })).subscribe();
    const upload = http.expectOne('/alternative-api/books/42/cover');
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body.get('file').name).toBe('a.png');
    upload.flush(testBook());
    service.deleteCover(42).subscribe();
    const coverDelete = http.expectOne('/alternative-api/books/42/cover');
    expect(coverDelete.request.method).toBe('DELETE');
    expect(coverDelete.request.body).toBeNull();
    coverDelete.flush(null, { status: 204, statusText: 'No Content' });
    service.startReading(42, { date: '2026-10-12' }).subscribe();
    http.expectOne('/alternative-api/books/42/start-reading').flush(testBook());
    service.finishReading(42, { date: '2026-10-12' }).subscribe();
    http.expectOne('/alternative-api/books/42/finish-reading').flush(testBook());
    service.updateReadingDates(42, { startedOn: '2026-10-12', finishedOn: null }).subscribe();
    http.expectOne('/alternative-api/books/42/reading-dates').flush(testBook());
    service.deleteReadingDates(42).subscribe();
    http
      .expectOne('/alternative-api/books/42/reading-dates')
      .flush(null, { status: 204, statusText: 'No Content' });
    http.verify();
  });
});
