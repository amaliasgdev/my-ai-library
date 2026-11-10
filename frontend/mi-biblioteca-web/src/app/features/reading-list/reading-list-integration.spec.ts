import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { BooksCatalog } from '../books/pages/books-catalog/books-catalog';
import { BookDetail } from '../books/pages/book-detail/book-detail';
import { testBook, testBookPage } from '../books/models/book.testing';

describe('Reading list catalog/detail integration', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const book = testBook({ id: 42 });
  const second = testBook({ id: 43, title: 'Otro libro' });
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => {
    harness.fixture.destroy();
    http.verify();
  });
  function batch() {
    return http.expectOne((req) => req.url === '/api/reading-list/membership');
  }
  function flushMembership(included = false) {
    batch().flush({
      revision: '9007199254740993',
      items: [
        { bookId: 42, included, entryId: included ? 7 : null },
        { bookId: 43, included: false, entryId: null },
      ],
    });
    harness.detectChanges();
  }
  async function catalog(url = '/books') {
    const page = await harness.navigateByUrl(url, BooksCatalog);
    http
      .expectOne((req) => req.url === '/api/books' || req.url === '/api/books/search')
      .flush(testBookPage({ content: [book, second], totalElements: 2 }));
    harness.detectChanges();
    return page;
  }

  it('queries the visible IDs in one batch and distinguishes pending, included and absent', async () => {
    await catalog();
    expect(harness.routeNativeElement!.textContent).toContain('Consultando lista');
    const request = batch();
    expect(request.request.params.getAll('bookId')).toEqual(['42', '43']);
    expect(request.request.params.keys()).toEqual(['bookId']);
    request.flush({
      revision: '7',
      items: [
        { bookId: 42, included: true, entryId: 8 },
        { bookId: 43, included: false, entryId: null },
      ],
    });
    harness.detectChanges();
    const cards = harness.routeNativeElement!.querySelectorAll('app-book-card');
    expect(cards[0].textContent).toContain('En mi lista');
    expect(cards[0].textContent).not.toContain('Añadir a lista');
    expect(cards[1].textContent).toContain('Añadir a lista de lectura');
  });

  it('keeps catalog functions and links usable when membership fails, without treating unknown as absent', async () => {
    const page = await catalog('/books?title=Dune&readingStatus=READ');
    batch().flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('app-book-card')).toHaveLength(2);
    expect(harness.routeNativeElement!.textContent).toContain('Pertenencia desconocida');
    expect(harness.routeNativeElement!.textContent).not.toContain('SECRET');
    expect(harness.routeNativeElement!.textContent).not.toContain('Añadir a lista de lectura');
    page.membership.add(42);
    http.expectNone((req) => req.method === 'POST');
    expect(
      harness
        .routeNativeElement!.querySelector('a[aria-label^="Ver detalle"]')
        ?.getAttribute('href'),
    ).toContain('title=Dune');
    page.membership.refresh();
    flushMembership(true);
    expect(harness.routeNativeElement!.textContent).toContain('En mi lista');
  });

  it('adds once using string revision, refreshes membership and never repeats duplicates', async () => {
    const page = await catalog();
    flushMembership();
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>(
      'button[aria-label^="Añadir a lista"]',
    )!;
    button.click();
    const request = http.expectOne('/api/reading-list/items');
    expect(request.request.body).toEqual({ bookId: 42, expectedRevision: '9007199254740993' });
    page.membership.add(42);
    page.membership.add(43);
    http.expectNone('/api/reading-list/items');
    request.flush({ revision: '9007199254740994', item: { entryId: 7 } });
    expect(page.membership.state(42)).toBe('loading');
    flushMembership(true);
    page.membership.add(42);
    http.expectNone('/api/reading-list/items');
    expect(harness.routeNativeElement!.textContent).toContain('Libro añadido');
  });

  it.each([409, 500, 0])(
    'reconciles error %s without replaying POST and keeps unknown on failed GET',
    async (status) => {
      const page = await catalog();
      flushMembership();
      page.membership.add(42);
      const request = http.expectOne('/api/reading-list/items');
      if (status === 0) request.error(new ProgressEvent('error'));
      else request.flush({}, { status, statusText: 'Error' });
      expect(page.membership.message()).toContain(
        status === 409 ? 'ha cambiado' : 'Resultado incierto',
      );
      batch().flush({}, { status: 503, statusText: 'Unavailable' });
      page.membership.add(42);
      expect(page.membership.state(42)).toBe('error');
      http.expectNone('/api/reading-list/items');
      page.membership.refresh();
      flushMembership(true);
      expect(page.membership.state(42)).toBe('included');
    },
  );

  it('cancels old batch on pagination and does not change the catalog query', async () => {
    const page = await catalog('/books?title=Dune&sortBy=author&direction=DESC');
    const old = batch();
    page.onPageChange({ pageIndex: 1, pageSize: 20, length: 40 });
    await harness.fixture.whenStable();
    expect(old.cancelled).toBe(true);
    const get = http.expectOne((req) => req.url === '/api/books/search');
    expect(get.request.params.get('title')).toBe('Dune');
    expect(get.request.params.get('sortBy')).toBe('author');
    expect(get.request.params.get('page')).toBe('1');
    get.flush(testBookPage({ content: [second], page: 1, totalElements: 40 }));
    const current = batch();
    expect(current.request.params.getAll('bookId')).toEqual(['43']);
    current.flush({ revision: '8', items: [{ bookId: 43, included: true, entryId: 9 }] });
    expect(page.membership.state(42)).toBe('loading');
    expect(page.membership.state(43)).toBe('included');
  });

  it('adds from detail using a single-ID batch and preserves catalog context', async () => {
    const page = await harness.navigateByUrl(
      '/books/42?title=Dune&page=2&sortBy=author',
      BookDetail,
    );
    http.expectOne('/api/books/42').flush(book);
    const membership = batch();
    expect(membership.request.params.getAll('bookId')).toEqual(['42']);
    membership.flush({ revision: '3', items: [{ bookId: 42, included: false, entryId: null }] });
    harness.detectChanges();
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('button[aria-label^="Añadir a lista"]')!
      .click();
    http.expectOne('/api/reading-list/items').flush({ revision: '4', item: { entryId: 9 } });
    batch().flush({ revision: '4', items: [{ bookId: 42, included: true, entryId: 9 }] });
    harness.detectChanges();
    expect(page.membership.state(42)).toBe('included');
    expect(page.catalogParams()).toEqual({ title: 'Dune', page: '2', sortBy: 'author' });
    expect(TestBed.inject(Router).url).toContain('title=Dune');
  });

  it('rejects late membership across detail ID changes and cancels writes on destruction', async () => {
    await harness.navigateByUrl('/books/42', BookDetail);
    http.expectOne('/api/books/42').flush(book);
    const old = batch();
    const page = await harness.navigateByUrl('/books/43', BookDetail);
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/books/43').flush(second);
    batch().flush({ revision: '4', items: [{ bookId: 43, included: false, entryId: null }] });
    page.membership.add(43);
    const request = http.expectOne('/api/reading-list/items');
    harness.fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('makes no membership request for an empty catalog', async () => {
    await harness.navigateByUrl('/books', BooksCatalog);
    http
      .expectOne((req) => req.url === '/api/books')
      .flush(testBookPage({ content: [], totalElements: 0 }));
    http.expectNone((req) => req.url.includes('membership'));
  });
});
