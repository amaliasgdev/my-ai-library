import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { BookImportReviewDialog } from '../../components/book-import-review-dialog/book-import-review-dialog';
import { BookRequest } from '../../models/book.models';
import { testBook, testBookLookup, testBookPage, testBookRequest } from '../../models/book.testing';
import { BookImport } from './book-import';

const A = '9780306406157';
const B = '9788411014090';
const C = '9788445073728';
describe('BookImport controlled HTTP workflow', () => {
  let fixture: ComponentFixture<BookImport>;
  let page: BookImport;
  let http: HttpTestingController;
  let result: Subject<BookRequest | undefined>;
  let open: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookImport],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                page: '2',
                size: '50',
                title: 'Dune',
                readingStatus: ['READING', 'READ'],
                ratingMin: '4',
                genre: 'Terror',
                sortBy: 'author',
                room: 'Filtro Salón',
                bookcase: 'Filtro Billy',
                shelf: 'Filtro 3',
              }),
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(BookImport);
    page = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    result = new Subject();
    open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => result.asObservable(),
      close: vi.fn(),
    } as unknown as MatDialogRef<BookImportReviewDialog, BookRequest>);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });
  function search(isbn = A) {
    return http.expectOne(
      (req) => req.url === '/api/books/search' && req.params.get('isbn') === isbn,
    );
  }
  function lookup(isbn = A) {
    return http.expectOne(
      (req) => req.url === '/api/books/isbn-lookup' && req.params.get('isbn') === isbn,
    );
  }
  function analyze(text = A) {
    page.text.setValue(text);
    page.analyze();
  }
  function newBook(isbn = A) {
    search(isbn).flush(testBookPage({ content: [], totalElements: 0, totalPages: 0 }));
    lookup(isbn).flush(testBookLookup({ isbn }));
  }
  function confirm(id = 0) {
    const row = page.rows()[id];
    page.review(row);
    result.next(testBookRequest({ isbn: row.isbn, title: 'Confirmed ' + id, author: 'Author' }));
  }
  function ready(text = A) {
    analyze(text);
    for (const isbn of text.split('\n')) newBook(isbn);
    for (const row of page.rows()) confirm(row.id);
  }
  function post() {
    return http.expectOne((req) => req.url === '/api/books' && req.method === 'POST');
  }

  it('renders sections, labeled textarea and contextual return, without starting HTTP', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Importar ISBN');
    expect(root.querySelector('mat-label')?.textContent).toBe('Lista de ISBN');
    expect(root.querySelector('textarea')).not.toBeNull();
    expect(root.textContent).toContain('backend/Open Library');
    expect(root.querySelector('a')?.getAttribute('href')).toContain('genre=Terror');
    http.expectNone((req) => req.method === 'GET');
  });

  it('each row starts without location, confirmed location survives reopening and is sent in its POST only', () => {
    analyze([A, B].join('\n'));
    newBook(A);
    newBook(B);
    expect(page.rows()[0].draft).toMatchObject({ room: '', bookcase: '', shelf: '' });
    expect(page.rows()[1].draft).toMatchObject({ room: '', bookcase: '', shelf: '' });
    page.review(page.rows()[0]);
    result.next(testBookRequest({ isbn: A, room: 'Salón', bookcase: 'Billy', shelf: 'Superior' }));
    page.review(page.rows()[0]);
    expect(open).toHaveBeenLastCalledWith(
      BookImportReviewDialog,
      expect.objectContaining({
        data: expect.objectContaining({ room: 'Salón', bookcase: 'Billy', shelf: 'Superior' }),
      }),
    );
    result.next(undefined);
    expect(page.rows()[0].request).toMatchObject({
      room: 'Salón',
      bookcase: 'Billy',
      shelf: 'Superior',
    });
    expect(page.rows()[1].draft).toMatchObject({ room: '', bookcase: '', shelf: '' });
    page.importSelected();
    const request = post();
    expect(request.request.body).toMatchObject({
      room: 'Salón',
      bookcase: 'Billy',
      shelf: 'Superior',
    });
    request.flush(testBook());
  });

  it('structured review preserves the confirmed Shelf when reopened, independent of other rows or catalog filters', () => {
    analyze([A, B].join('\n'));
    newBook(A);
    newBook(B);
    const request = testBookRequest({ isbn: A });
    delete request.room;
    delete request.bookcase;
    delete request.shelf;
    request.location = { kind: 'SHELF', shelfId: 42 };
    page.review(page.rows()[0]);
    result.next(request);
    page.review(page.rows()[0]);
    expect(open).toHaveBeenLastCalledWith(
      BookImportReviewDialog,
      expect.objectContaining({
        data: expect.objectContaining({ shelfId: 42, room: '', bookcase: '', shelf: '' }),
      }),
    );
    result.next(undefined);
    expect(page.rows()[1].draft?.shelfId ?? null).toBeNull();
    page.importSelected();
    const created = post();
    expect(created.request.body).toEqual(request);
    created.flush(testBook({ shelfId: 42 }));
  });
  it('missing Shelf at POST requires explicit review, never marks ISBN existing or retries automatically', () => {
    analyze(A);
    newBook(A);
    confirm(0);
    page.importSelected();
    post().flush({ code: 'LOCATION_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(page.rows()[0].creation).toBe('error');
    expect(page.rows()[0].existence).toBe('new');
    expect(page.rows()[0].message).toContain('ubicación');
    http.expectNone((req) => req.method === 'POST');
  });
  it('existence checks ignore catalog filters and existing ISBN never does lookup/POST', () => {
    analyze();
    const req = search();
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('1');
    for (const key of ['title', 'genre', 'readingStatus', 'ratingMin', 'room', 'bookcase', 'shelf'])
      expect(req.request.params.has(key)).toBe(false);
    req.flush(testBookPage({ content: [testBook({ id: 7 })], totalElements: 1 }));
    expect(page.rows()[0].existence).toBe('existing');
    expect(page.rows()[0].bookId).toBe(7);
    expect(page.status(page.rows()[0])).toBe('Ya existe');
    page.review(page.rows()[0]);
    page.select(page.rows()[0], true);
    page.importSelected();
    expect(open).not.toHaveBeenCalled();
    http.expectNone((request) => request.url.includes('isbn-lookup') || request.method === 'POST');
  });
  it('new ISBN looks up metadata but never becomes ready without confirmation', () => {
    analyze();
    newBook();
    expect(page.rows()[0].metadata).toBe('found');
    expect(page.rows()[0].creation).toBe('notReady');
    expect(page.checking()).toBe(false);
    expect(page.completed()).toBe(1);
    page.select(page.rows()[0], true);
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
    expect(page.status(page.rows()[0])).toContain('falta confirmar');
  });
  it.each([0, 404, 500])(
    'existence error %s is not new and never triggers lookup/import',
    (status) => {
      analyze();
      search().flush({}, { status, statusText: 'Error' });
      expect(page.rows()[0].existence).toBe('error');
      expect(page.rows()[0].message).toBe('Error al comprobar existencia');
      expect(page.canReview(page.rows()[0])).toBe(false);
      page.importSelected();
      http.expectNone((req) => req.url.includes('isbn-lookup') || req.method === 'POST');
    },
  );
  it.each([404, 502, 503, 504, 0])(
    'lookup error %s stays individual and permits manual review',
    (status) => {
      analyze();
      search().flush(testBookPage({ content: [], totalElements: 0 }));
      lookup().flush({}, { status, statusText: 'Error' });
      expect(page.rows()[0].metadata).toBe(status === 404 ? 'notFound' : 'error');
      expect(page.rows()[0].creation).toBe('notReady');
      confirm();
      expect(page.rows()[0].creation).toBe('ready');
      http.expectNone((req) => req.method === 'POST');
    },
  );
  it('partial metadata can be reviewed; Cancel leaves row unconfirmed and draft intact', () => {
    analyze();
    search().flush(testBookPage({ totalElements: 0, content: [] }));
    lookup().flush(testBookLookup({ isbn: A, author: null }));
    page.review(page.rows()[0]);
    expect(open).toHaveBeenCalledWith(
      BookImportReviewDialog,
      expect.objectContaining({ data: expect.objectContaining({ isbn: A, author: '' }) }),
    );
    result.next(undefined);
    expect(page.rows()[0].creation).toBe('notReady');
    expect(page.rows()[0].draft.author).toBe('');
  });
  it('confirmation prepares a request and selection; excluding prevents POST', () => {
    analyze();
    newBook();
    confirm();
    expect(page.selectedCount()).toBe(1);
    expect(page.rows()[0].request?.title).toBe('Confirmed 0');
    page.select(page.rows()[0], false);
    page.importSelected();
    expect(page.selectedCount()).toBe(0);
    http.expectNone((req) => req.method === 'POST');
  });
  it('keeps two rows active at most, including queued existence and lookup operations', () => {
    analyze([A, B, C].join('\n'));
    const first = search(A);
    const second = search(B);
    http.expectNone((req) => req.params.get('isbn') === C);
    first.flush(testBookPage({ content: [], totalElements: 0 }));
    const firstLookup = lookup(A);
    http.expectNone((req) => req.params.get('isbn') === C);
    second.flush(testBookPage({ totalElements: 1 }));
    const third = search(C);
    expect(page.completed()).toBe(1);
    third.flush(testBookPage({ content: [], totalElements: 0 }));
    lookup(C).flush(testBookLookup({ isbn: C }));
    firstLookup.flush(testBookLookup({ isbn: A }));
    expect(page.completed()).toBe(3);
    expect(page.checking()).toBe(false);
  });
  it('cancel unsubscribes active HTTP, stops queue and permits only explicit retry', () => {
    analyze([A, B, C].join('\n'));
    const first = search(A);
    const second = search(B);
    page.cancelChecks();
    expect(first.cancelled).toBe(true);
    expect(second.cancelled).toBe(true);
    expect(() => first.flush(testBookPage())).toThrow();
    http.expectNone((req) => req.params.get('isbn') === C);
    expect(page.rows().every((row) => row.existence === 'error')).toBe(true);
    page.retryLookup(page.rows()[2]);
    newBook(C);
    expect(page.rows()[2].metadata).toBe('found');
  });
  it('new generation cannot receive prior canceled result', () => {
    analyze();
    const old = search();
    page.cancelChecks();
    analyze(B);
    expect(old.cancelled).toBe(true);
    newBook(B);
    expect(page.rows()).toHaveLength(1);
    expect(page.rows()[0].isbn).toBe(B);
  });
  it('destroy cancels requests and queued work', () => {
    analyze([A, B, C].join('\n'));
    const a = search(A);
    const b = search(B);
    fixture.destroy();
    expect(a.cancelled).toBe(true);
    expect(b.cancelled).toBe(true);
    http.expectNone((req) => req.params.get('isbn') === C);
  });
  it('canonical duplicates process once and invalid rows never enter queue', () => {
    analyze(`${A}\n978-0-306-40615-7\nBAD`);
    newBook();
    expect(page.rows()).toHaveLength(2);
    expect(page.rows()[0].occurrences).toBe(2);
    expect(page.rows()[1].isbn).toBeNull();
    page.review(page.rows()[1]);
    page.select(page.rows()[1], true);
    page.importSelected();
    http.expectNone((req) => req.method === 'GET' || req.method === 'POST');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Repetido 2 veces');
  });
  it.each(['x'.repeat(10001), Array(101).fill(A).join(';')])(
    'limit rejection starts no HTTP',
    (text) => {
      analyze(text);
      expect(page.error()).not.toBeNull();
      http.expectNone(() => true);
    },
  );
  it('lookup retry is explicit and rechecks existence before querying provider again', () => {
    analyze();
    search().flush(testBookPage({ totalElements: 0 }));
    lookup().flush({}, { status: 503, statusText: 'Error' });
    http.expectNone((req) => req.method === 'GET');
    page.retryLookup(page.rows()[0]);
    newBook();
    expect(page.rows()[0].metadata).toBe('found');
  });
  it('creates one with POST and never repeats its acknowledged success, even with stale actions', () => {
    ready();
    const stale = page.rows()[0];
    page.importSelected();
    const req = post();
    expect(req.request.body.isbn).toBe(A);
    req.flush(testBook({ id: 9, isbn: A }));
    expect(page.rows()[0].creation).toBe('created');
    expect(page.rows()[0].bookId).toBe(9);
    page.select(stale, true);
    page.review(stale);
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('creates sequentially, ignores double click, freezes selection and reports multiple successes', () => {
    ready([A, B].join('\n'));
    page.importSelected();
    const first = post();
    page.importSelected();
    page.select(page.rows()[1], false);
    expect(page.rows()[1].selected).toBe(true);
    http.expectNone((req) => req.method === 'POST');
    first.flush(testBook({ isbn: A }));
    const second = post();
    expect(second.request.body.isbn).toBe(B);
    second.flush(testBook({ id: 2, isbn: B }));
    expect(page.createdCount()).toBe(2);
    expect(page.creating()).toBe(false);
  });
  it('partial success remains and validation failure can be reviewed and explicitly retried alone', () => {
    ready([A, B, C].join('\n'));
    page.importSelected();
    post().flush(testBook({ isbn: A }));
    post().flush({}, { status: 400, statusText: 'Bad Request' });
    post().flush(testBook({ id: 3, isbn: C }));
    expect(page.createdCount()).toBe(2);
    expect(page.rows()[1].creation).toBe('error');
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
    confirm(1);
    page.importSelected();
    const retry = post();
    expect(retry.request.body.isbn).toBe(B);
    retry.flush(testBook({ id: 2, isbn: B }));
    expect(page.createdCount()).toBe(3);
  });
  it('stop waits for active write and does not start pending rows or revert success', () => {
    ready([A, B].join('\n'));
    page.importSelected();
    const active = post();
    page.stopCreation();
    expect(active.cancelled).toBe(false);
    expect(page.creating()).toBe(true);
    active.flush(testBook());
    expect(page.creating()).toBe(false);
    expect(page.createdCount()).toBe(1);
    expect(page.rows()[1].creation).toBe('ready');
    http.expectNone((req) => req.method === 'POST');
  });
  it('409 is conflict/existing and cannot overwrite or retry', () => {
    ready();
    page.importSelected();
    post().flush({}, { status: 409, statusText: 'Conflict' });
    expect(page.status(page.rows()[0])).toBe('Conflicto');
    expect(page.rows()[0].existence).toBe('existing');
    page.review(page.rows()[0]);
    page.select(page.rows()[0], true);
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
  });
  it.each([0, 500, 502, 504])(
    'POST %s becomes uncertain, not automatically retried or reviewed',
    (status) => {
      ready();
      page.importSelected();
      post().flush({}, { status, statusText: 'Error' });
      expect(page.rows()[0].creation).toBe('uncertain');
      page.importSelected();
      page.select(page.rows()[0], true);
      page.review(page.rows()[0]);
      http.expectNone((req) => req.method === 'POST');
      expect(open).toHaveBeenCalledTimes(1);
    },
  );
  it('uncertain reconciliation finding ISBN blocks POST and offers existing detail', () => {
    ready();
    page.importSelected();
    post().flush({}, { status: 0, statusText: 'Network' });
    page.reconcile(page.rows()[0]);
    search().flush(testBookPage({ totalElements: 1, content: [testBook({ id: 8 })] }));
    expect(page.rows()[0].existence).toBe('existing');
    expect(page.rows()[0].bookId).toBe(8);
    page.select(page.rows()[0], true);
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
  });
  it('uncertain reconciliation absent enables only an explicit selection and retry', () => {
    ready();
    page.importSelected();
    post().flush({}, { status: 500, statusText: 'Error' });
    page.reconcile(page.rows()[0]);
    search().flush(testBookPage({ totalElements: 0, content: [] }));
    expect(page.rows()[0].creation).toBe('ready');
    expect(page.rows()[0].selected).toBe(false);
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
    page.select(page.rows()[0], true);
    page.importSelected();
    post().flush(testBook());
    expect(page.createdCount()).toBe(1);
  });
  it('reconciliation failure stays uncertain and cannot enable retry', () => {
    ready();
    page.importSelected();
    post().flush({}, { status: 0, statusText: 'Network' });
    page.reconcile(page.rows()[0]);
    search().flush({}, { status: 503, statusText: 'Error' });
    expect(page.rows()[0].creation).toBe('uncertain');
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
  });
  it('invalid existence response is an error, never an assumption that the ISBN is new', () => {
    analyze();
    search().flush({});
    expect(page.rows()[0].existence).toBe('error');
    http.expectNone((req) => req.url.includes('isbn-lookup'));
  });
  it('invalid POST confirmation becomes uncertain instead of throwing or enabling repetition', () => {
    ready();
    page.importSelected();
    post().flush(null);
    expect(page.rows()[0].creation).toBe('uncertain');
    expect(page.creating()).toBe(false);
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
  });
  it('a row error does not abort remaining queued lookups', () => {
    analyze([A, B, C].join('\n'));
    search(A).flush({}, { status: 500, statusText: 'Error' });
    newBook(B);
    newBook(C);
    expect(page.rows()[0].existence).toBe('error');
    expect(page.rows()[1].metadata).toBe('found');
    expect(page.rows()[2].metadata).toBe('found');
    expect(page.completed()).toBe(3);
  });
  it('destroy closes review and ignores late confirmation', () => {
    analyze();
    newBook();
    page.review(page.rows()[0]);
    const ref = open.mock.results[0].value;
    fixture.destroy();
    expect(ref.close).toHaveBeenCalledOnce();
    result.next(testBookRequest({ isbn: A }));
    expect(page.rows()[0].creation).toBe('notReady');
    page.importSelected();
    http.expectNone((req) => req.method === 'POST');
  });
  it('25 unique ISBN limit prevents every HTTP call rather than truncating to 25', () => {
    const values = Array.from({ length: 26 }, (_, index) => {
      const digits = '978' + String(index).padStart(9, '0');
      const sum = [...digits].reduce(
        (total, digit, position) => total + Number(digit) * (position % 2 ? 3 : 1),
        0,
      );
      return digits + String((10 - (sum % 10)) % 10);
    });
    analyze(values.join('\n'));
    expect(page.error()).toContain('25');
    expect(page.rows()).toHaveLength(26);
    http.expectNone(() => true);
  });
});
