import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { routes } from '../../../../app.routes';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';

describe('BooksCatalog URL source of truth (real Router)', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;
  let page: BooksCatalog;
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    // Harness navigation does not bootstrap the application's popstate listener.
    router.setUpLocationChangeListener();
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => {
    http.verify();
    harness.fixture.destroy();
  });
  async function enter(url = '/books') {
    page = await harness.navigateByUrl(url, BooksCatalog);
    await harness.fixture.whenStable();
  }
  function request() {
    return http.expectOne((req) => req.url === '/api/books' || req.url === '/api/books/search');
  }
  async function loaded(url = '/books', index = 0, size = 20) {
    await enter(url);
    request().flush(testBookPage({ page: index, size, totalElements: 200, totalPages: 10 }));
    harness.detectChanges();
  }
  function params() {
    return router.parseUrl(router.url).queryParams;
  }
  async function stable() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  function paginator() {
    return harness.routeDebugElement!.query(By.directive(MatPaginator))
      .componentInstance as MatPaginator;
  }

  it('starts exactly one default GET without default params in the URL', async () => {
    await enter();
    const req = request();
    expect(req.request.url).toBe('/api/books');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    expect(router.url).toBe('/books');
    req.flush(testBookPage());
    http.expectNone((req) => req.method === 'GET');
  });
  it('restores page, size, sort and search on a direct URL with a single effective GET', async () => {
    await enter('/books?page=2&size=50&sortBy=author&direction=DESC&title=Dune&author=Herbert');
    const req = request();
    expect(req.request.url).toBe('/api/books/search');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('50');
    expect(req.request.params.get('sortBy')).toBe('author');
    expect(req.request.params.get('direction')).toBe('DESC');
    expect(req.request.params.get('title')).toBe('Dune');
    expect(page.searchForm.getRawValue()).toEqual({ title: 'Dune', author: 'Herbert', isbn: '' });
    expect(page.currentSearch()).toEqual({ title: 'Dune', author: 'Herbert' });
    req.flush(testBookPage({ page: 2, size: 50 }));
    harness.detectChanges();
    expect(paginator().pageIndex).toBe(2);
    expect(paginator().pageSize).toBe(50);
  });
  it.each([
    '/books?page=-4',
    '/books?size=999',
    '/books?direction=down',
    '/books?foo=bar',
    '/books?page=2&page=3',
    '/books?page=0&size=20&sortBy=title&direction=ASC',
  ])('canonicalizes %s before any GET and replaces history', async (url) => {
    const navigate = vi.spyOn(router, 'navigate');
    await enter(url);
    expect(router.url).toBe('/books');
    expect(navigate).toHaveBeenCalledWith(['/books'], { queryParams: {}, replaceUrl: true });
    const req = request();
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush(testBookPage());
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
  });
  it('canonicalizes trim and ISBN conflicts without requesting invalid search', async () => {
    await enter('/books?title=Dune&author=Herbert&isbn=%209780306406157%20');
    expect(params()).toEqual({ isbn: '9780306406157' });
    const req = request();
    expect(req.request.params.get('isbn')).toBe('9780306406157');
    expect(req.request.params.has('title')).toBe(false);
    expect(req.request.params.has('author')).toBe(false);
    req.flush(testBookPage());
    await enter('/books?isbn=INVALID&title=%20Dune%20');
    expect(params()).toEqual({ title: 'Dune' });
    const titleReq = request();
    expect(titleReq.request.params.get('title')).toBe('Dune');
    expect(titleReq.request.params.has('isbn')).toBe(false);
    titleReq.flush(testBookPage());
  });
  it('keeps unapplied drafts through page, sort, direction, retry and write reload', async () => {
    await loaded('/books?title=Dune');
    page.searchForm.controls.title.setValue('Draft');
    await stable();
    expect(params()).toEqual({ title: 'Dune' });
    http.expectNone((req) => req.method === 'GET');
    page.onPageChange({ pageIndex: 2, pageSize: 20, length: 200 });
    await stable();
    expect(params()).toEqual({ page: '2', title: 'Dune' });
    request().flush(testBookPage({ page: 2 }));
    page.onSortByChange('rating');
    await stable();
    expect(params()).toEqual({ sortBy: 'rating', title: 'Dune' });
    request().flush(testBookPage());
    page.onSortDirectionChange('DESC');
    await stable();
    request().flush({}, { status: 500, statusText: 'Error' });
    await stable();
    const navigate = vi.spyOn(router, 'navigate');
    Array.from(harness.routeNativeElement!.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reintentar')!
      .click();
    await stable();
    expect(navigate).not.toHaveBeenCalled();
    const retry = request();
    expect(retry.request.params.get('title')).toBe('Dune');
    retry.flush(testBookPage());
    page.updateRating({ id: 1, rating: 4 });
    http.expectOne('/api/books/1/rating').flush(testBook({ rating: 4 }));
    const reload = request();
    expect(reload.request.params.get('title')).toBe('Dune');
    reload.flush(testBookPage());
    expect(page.searchForm.controls.title.value).toBe('Draft');
  });
  it('Buscar only navigates, resets page, retains settings and makes GET only after URL applies', async () => {
    await loaded('/books?page=3&size=50&sortBy=author&direction=DESC', 3, 50);
    page.searchForm.controls.title.setValue(' Dune ');
    page.submitSearch();
    http.expectNone((req) => req.method === 'GET');
    expect(page.currentSearch()).toBeNull();
    await stable();
    expect(params()).toEqual({ size: '50', sortBy: 'author', direction: 'DESC', title: 'Dune' });
    const req = request();
    expect(req.request.params.get('page')).toBe('0');
    req.flush(testBookPage({ size: 50 }));
    page.clearSearch();
    await stable();
    expect(params()).toEqual({ size: '50', sortBy: 'author', direction: 'DESC' });
    expect(page.searchForm.getRawValue()).toEqual({ title: '', author: '', isbn: '' });
    request().flush(testBookPage({ size: 50 }));
  });
  it('invalid form does not navigate and Limpiar clears drafts even when effective query is unchanged', async () => {
    await loaded();
    const navigate = vi.spyOn(router, 'navigate');
    page.searchForm.setValue({ title: 'Dune', author: '', isbn: '9780306406157' });
    page.submitSearch();
    expect(navigate).not.toHaveBeenCalled();
    expect(page.searchForm.touched).toBe(true);
    page.clearSearch();
    await stable();
    expect(page.searchForm.getRawValue()).toEqual({ title: '', author: '', isbn: '' });
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone((req) => req.method === 'GET');
  });
  it('sort/page/size navigate preserving the applied search and ignore already active values', async () => {
    await loaded('/books?page=2&title=Dune', 2);
    page.onSortByChange('author');
    await stable();
    expect(params()).toEqual({ sortBy: 'author', title: 'Dune' });
    request().flush(testBookPage());
    page.onSortDirectionChange('DESC');
    await stable();
    expect(params()).toEqual({ sortBy: 'author', direction: 'DESC', title: 'Dune' });
    request().flush(testBookPage());
    page.onPageChange({ pageIndex: 3, pageSize: 20, length: 200 });
    await stable();
    expect(params()['page']).toBe('3');
    request().flush(testBookPage({ page: 3 }));
    page.onPageChange({ pageIndex: 3, pageSize: 100, length: 200 });
    await stable();
    expect(params()).toEqual({ size: '100', sortBy: 'author', direction: 'DESC', title: 'Dune' });
    request().flush(testBookPage({ size: 100 }));
    const navigate = vi.spyOn(router, 'navigate');
    page.onSortByChange('author');
    page.onSortDirectionChange('DESC');
    page.onPageChange({ pageIndex: 0, pageSize: 100, length: 200 });
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone((req) => req.method === 'GET');
  });
  it('cancels old requests during rapid URL changes and clears old cards', async () => {
    await loaded();
    await enter('/books?title=First');
    const first = request();
    expect(harness.routeNativeElement!.querySelector('app-book-card')).toBeNull();
    await enter('/books?title=Second');
    expect(first.cancelled).toBe(true);
    expect(() => first.flush(testBookPage())).toThrow();
    request().flush(testBookPage());
  });
  it('reloads the current URL after DELETE, falls back one page through replaceUrl, then stops', async () => {
    await loaded('/books?page=2&sortBy=author&title=Dune', 2);
    page.openDeleteDialog(testBook());
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(page.deletingId()).toBe(1));
    const deletion = http.expectOne('/api/books/1');
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    expect(params()).toEqual({ page: '2', sortBy: 'author', title: 'Dune' });
    const reload = request();
    expect(reload.request.params.get('page')).toBe('2');
    const navigate = vi.spyOn(router, 'navigate');
    reload.flush(testBookPage({ page: 2, content: [], totalElements: 20 }));
    http.expectNone((req) => req.method === 'GET');
    await stable();
    expect(params()).toEqual({ page: '1', sortBy: 'author', title: 'Dune' });
    expect(navigate).toHaveBeenCalledWith(['/books'], {
      queryParams: { page: '1', sortBy: 'author', title: 'Dune' },
      replaceUrl: true,
    });
    const previous = request();
    expect(previous.request.params.get('page')).toBe('1');
    previous.flush(testBookPage({ page: 1, content: [], totalElements: 20 }));
    await stable();
    http.expectNone((req) => req.method === 'GET');
  });

  it('never repeats a committed DELETE after reload fails, and retry keeps the current URL', async () => {
    await loaded('/books?title=Dune');
    page.openDeleteDialog(testBook());
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(page.deletingId()).toBe(1));
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    request().flush({}, { status: 500, statusText: 'Error' });
    await stable();
    expect(page.deleteError()).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain(
      'El servidor no pudo realizar la búsqueda',
    );
    Array.from(harness.routeNativeElement!.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reintentar')!
      .click();
    await stable();
    expect(params()).toEqual({ title: 'Dune' });
    http.expectNone((req) => req.method === 'DELETE');
    request().flush(testBookPage());
  });
  it('restores applied query using browser Back and Forward', async () => {
    await loaded('/books?title=Dune');
    page.onSortByChange('author');
    await stable();
    request().flush(testBookPage());
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(router.url).toBe('/books?title=Dune'));
    request().flush(testBookPage());
    expect(page.currentSort().sortBy).toBe('title');
    TestBed.inject(Location).forward();
    await vi.waitFor(() => expect(params()).toEqual({ sortBy: 'author', title: 'Dune' }));
    request().flush(testBookPage());
    expect(page.currentSort().sortBy).toBe('author');
  });

  it('restores the same catalog URL after browser Back from detail', async () => {
    await loaded('/books?page=2&size=50&sortBy=author&direction=DESC&title=Dune', 2, 50);
    const url = router.url;
    harness
      .routeNativeElement!.querySelector<HTMLAnchorElement>('a[aria-label^="Ver detalle de "]')!
      .click();
    await stable();
    expect(router.parseUrl(router.url).queryParams).toEqual({
      page: '2',
      size: '50',
      sortBy: 'author',
      direction: 'DESC',
      title: 'Dune',
    });
    http.expectOne('/api/books/1').flush(testBook());
    await stable();
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(router.url).toBe(url));
    const restored = request();
    expect(restored.request.params.get('page')).toBe('2');
    expect(restored.request.params.get('size')).toBe('50');
    expect(restored.request.params.get('title')).toBe('Dune');
    restored.flush(testBookPage({ page: 2, size: 50 }));
  });
});
