import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { BookIsbnImportDialog } from '../../components/book-isbn-import-dialog/book-isbn-import-dialog';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../../app.routes';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';

describe('catalog filters with real Router and HTTP boundary', () => {
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
    router.setUpLocationChangeListener();
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => {
    http.verify();
    harness.fixture.destroy();
  });
  function request() {
    return http.expectOne((req) => req.url === '/api/books' || req.url === '/api/books/search');
  }
  async function stable() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  async function enter(url = '/books') {
    page = await harness.navigateByUrl(url, BooksCatalog);
    await stable();
  }
  async function loaded(url = '/books') {
    await enter(url);
    request().flush(testBookPage({ totalElements: 100, totalPages: 5 }));
    await stable();
  }
  function params() {
    return router.parseUrl(router.url).queryParams;
  }
  function button(label: string) {
    return Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button'),
    ).find((item) => item.textContent?.trim() === label)!;
  }

  it('renders an accessible separate filter form with ten controls and native submit', async () => {
    await loaded();
    const form = harness.routeNativeElement!.querySelector<HTMLFormElement>('.filters-form')!;
    expect(form.getAttribute('aria-labelledby')).toBe('filters-heading');
    expect(form.getAttribute('aria-describedby')).toBe('filters-help');
    expect(form.querySelectorAll('mat-label')).toHaveLength(10);
    expect(
      form.querySelector('mat-select[formControlName="readingStatus"]')?.hasAttribute('multiple'),
    ).toBe(true);
    expect(button('Aplicar filtros').type).toBe('submit');
    expect(button('Limpiar filtros').type).toBe('button');
    expect(harness.routeNativeElement!.querySelector('.search-form')).not.toBe(form);
  });
  it('editing drafts neither navigates nor requests; native submit applies', async () => {
    await loaded();
    const navigate = vi.spyOn(router, 'navigate');
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(
      '.filters-form [formControlName="genre"]',
    )!;
    input.value = ' Terror ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await stable();
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone((req) => req.method === 'GET');
    harness
      .routeNativeElement!.querySelector('form.filters-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await stable();
    expect(params()).toEqual({ genre: 'Terror' });
    const req = request();
    expect(req.request.params.get('genre')).toBe('Terror');
    req.flush(testBookPage());
  });
  it('Apply resets page and keeps applied search, sorting and size; one GET for an effective change', async () => {
    await loaded('/books?page=2&size=50&sortBy=author&direction=DESC&title=Dune');
    page.filtersForm.patchValue({
      readingStatus: ['READ', 'READING'],
      ratingMin: 4,
      yearFrom: 2020,
      yearTo: 2021,
      genre: ' Terror ',
      language: ' ES ',
      publisher: ' Press ',
    });
    button('Aplicar filtros').click();
    await stable();
    expect(params()).toEqual({
      size: '50',
      sortBy: 'author',
      direction: 'DESC',
      title: 'Dune',
      readingStatus: ['READING', 'READ'],
      ratingMin: '4',
      yearFrom: '2020',
      yearTo: '2021',
      genre: 'Terror',
      language: 'es',
      publisher: 'Press',
    });
    const req = request();
    expect(req.request.url).toBe('/api/books/search');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.getAll('readingStatus')).toEqual(['READING', 'READ']);
    req.flush(testBookPage());
    page.applyFilters();
    await stable();
    http.expectNone((item) => item.method === 'GET');
  });
  it('Clear empties filters and drafts only, retains search/sort/size and avoids unchanged GET', async () => {
    await loaded('/books?page=2&size=50&sortBy=author&title=Dune&ratingMin=4&genre=Terror');
    page.filtersForm.controls.publisher.setValue('Draft');
    button('Limpiar filtros').click();
    await stable();
    expect(params()).toEqual({ size: '50', sortBy: 'author', title: 'Dune' });
    expect(page.currentFilters()).toEqual({});
    expect(page.filtersForm.controls.publisher.value).toBe('');
    const req = request();
    expect(req.request.params.has('ratingMin')).toBe(false);
    req.flush(testBookPage());
    page.filtersForm.controls.genre.setValue('Draft');
    page.clearFilters();
    await stable();
    expect(page.filtersForm.controls.genre.value).toBe('');
    http.expectNone((item) => item.method === 'GET');
  });
  it('invalid form stays local and shows field/range errors', async () => {
    await loaded();
    page.filtersForm.patchValue({ language: 'zz', yearFrom: 2021, yearTo: 2020 });
    button('Aplicar filtros').click();
    await stable();
    expect(page.filtersForm.touched).toBe(true);
    expect(router.url).toBe('/books');
    expect(harness.routeNativeElement!.textContent).toContain('El año hasta no puede ser anterior');
    expect(harness.routeNativeElement!.textContent).toContain(
      'Introduce un código de idioma reconocido',
    );
    http.expectNone((req) => req.method === 'GET');
  });
  it('search submit and clear search retain filters, independently of filter drafts', async () => {
    await loaded('/books?ratingMin=4');
    page.filtersForm.controls.genre.setValue('Draft');
    page.searchForm.controls.title.setValue('Dune');
    page.submitSearch();
    await stable();
    expect(params()).toEqual({ title: 'Dune', ratingMin: '4' });
    const search = request();
    expect(search.request.params.get('ratingMin')).toBe('4');
    search.flush(testBookPage());
    page.clearSearch();
    await stable();
    expect(params()).toEqual({ ratingMin: '4' });
    const list = request();
    expect(list.request.url).toBe('/api/books');
    list.flush(testBookPage());
    expect(page.filtersForm.controls.genre.value).toBe('Draft');
  });
  it('canonicalizes malformed URL before one GET without alerts', async () => {
    const navigate = vi.spyOn(router, 'navigate');
    await enter(
      '/books?readingStatus=READ&readingStatus=READING&readingStatus=READ&ratingMin=4&ratingMin=5&yearFrom=2021&yearTo=2020&genre=%20Terror%20&language=ES&foo=x',
    );
    const canonical = { readingStatus: ['READING', 'READ'], genre: 'Terror', language: 'es' };
    expect(params()).toEqual(canonical);
    expect(navigate).toHaveBeenCalledWith(['/books'], { queryParams: canonical, replaceUrl: true });
    const req = request();
    expect(req.request.params.has('ratingMin')).toBe(false);
    expect(req.request.params.has('yearFrom')).toBe(false);
    req.flush(testBookPage());
    await stable();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
  });
  it('initial URL/restored entry fills filters and invokes the matching filtered search', async () => {
    await enter(
      '/books?isbn=9780306406157&readingStatus=READ&ratingMin=4&yearFrom=2020&language=es',
    );
    expect(page.filtersForm.controls.readingStatus.value).toEqual(['READ']);
    expect(page.filtersForm.controls.ratingMin.value).toBe(4);
    const req = request();
    expect(req.request.url).toBe('/api/books/search');
    expect(req.request.params.get('isbn')).toBe('9780306406157');
    req.flush(testBookPage());
    await harness.navigateByUrl('/books/new');
    await enter(
      '/books?isbn=9780306406157&readingStatus=READ&ratingMin=4&yearFrom=2020&language=es',
    );
    expect(page.filtersForm.controls.yearFrom.value).toBe(2020);
    request().flush(testBookPage());
  });
  it('Back and Forward restore applied filters, not unsaved drafts', async () => {
    await loaded('/books?genre=Terror');
    page.filtersForm.controls.ratingMin.setValue(4);
    page.applyFilters();
    await stable();
    request().flush(testBookPage());
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(params()).toEqual({ genre: 'Terror' }));
    request().flush(testBookPage());
    expect(page.filtersForm.controls.ratingMin.value).toBeNull();
    TestBed.inject(Location).forward();
    await vi.waitFor(() => expect(params()).toEqual({ ratingMin: '4', genre: 'Terror' }));
    request().flush(testBookPage());
    expect(page.filtersForm.controls.ratingMin.value).toBe(4);
  });
  it('page/sort/retry preserve unapplied drafts and retry the current filters', async () => {
    await loaded('/books?genre=Terror');
    page.filtersForm.controls.publisher.setValue('Draft');
    page.onPageChange({ pageIndex: 1, pageSize: 20, length: 100 });
    await stable();
    request().flush(testBookPage());
    page.onSortByChange('author');
    await stable();
    const failed = request();
    expect(failed.request.params.get('genre')).toBe('Terror');
    failed.flush({}, { status: 500, statusText: 'Error' });
    await stable();
    button('Reintentar').click();
    await stable();
    const retry = request();
    expect(retry.request.params.has('publisher')).toBe(false);
    expect(retry.request.params.get('genre')).toBe('Terror');
    retry.flush(testBookPage());
    expect(page.filtersForm.controls.publisher.value).toBe('Draft');
  });
  it('changing filters cancels prior GET and removes stale cards', async () => {
    await loaded();
    page.filtersForm.controls.genre.setValue('Terror');
    page.applyFilters();
    await stable();
    const previous = request();
    expect(harness.routeNativeElement!.querySelector('app-book-card')).toBeNull();
    page.filtersForm.controls.genre.setValue('Drama');
    page.applyFilters();
    await stable();
    expect(previous.cancelled).toBe(true);
    const current = request();
    expect(current.request.params.get('genre')).toBe('Drama');
    current.flush(testBookPage());
  });
  it.each(['status', 'start', 'finish'])(
    '%s confirmation reloads active readingStatus filters without repeating write',
    async (action) => {
      await loaded('/books?readingStatus=TO_READ');
      if (action === 'status') page.updateReadingStatus({ id: 1, status: 'READ' });
      else if (action === 'start') page.startReading(1);
      else page.finishReading(1);
      const path =
        action === 'status'
          ? 'reading-status'
          : action === 'start'
            ? 'start-reading'
            : 'finish-reading';
      http.expectOne('/api/books/1/' + path).flush(testBook({ readingStatus: 'READ' }));
      const reload = request();
      expect(reload.request.params.get('readingStatus')).toBe('TO_READ');
      reload.flush(testBookPage({ content: [] }));
      http.expectNone((req) => req.method !== 'GET');
    },
  );
  it('rating confirmation reloads ratingMin even when sort is title', async () => {
    await loaded('/books?ratingMin=4');
    page.updateRating({ id: 1, rating: 3 });
    http.expectOne('/api/books/1/rating').flush(testBook({ rating: 3 }));
    const reload = request();
    expect(reload.request.params.get('ratingMin')).toBe('4');
    reload.flush(testBookPage({ content: [] }));
    http.expectNone((req) => req.method !== 'GET');
  });
  it('write confirmation reloads changed current filters, never its original query', async () => {
    await loaded('/books?readingStatus=TO_READ');
    page.updateReadingStatus({ id: 1, status: 'READ' });
    const write = http.expectOne('/api/books/1/reading-status');
    await enter('/books?readingStatus=READ');
    const pending = request();
    write.flush(testBook({ readingStatus: 'READ' }));
    expect(pending.cancelled).toBe(true);
    const reload = request();
    expect(reload.request.params.get('readingStatus')).toBe('READ');
    reload.flush(testBookPage());
  });
  it('DELETE guards filter actions and retains filters across reload and one-page fallback', async () => {
    await loaded('/books?page=2&genre=Terror');
    page.openDeleteDialog(testBook());
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(page.deletingId()).toBe(1));
    page.filtersForm.controls.genre.setValue('Draft');
    page.applyFilters();
    page.clearFilters();
    expect(params()).toEqual({ page: '2', genre: 'Terror' });
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    const reload = request();
    expect(reload.request.params.get('genre')).toBe('Terror');
    reload.flush(testBookPage({ content: [], page: 2, totalElements: 20 }));
    await stable();
    expect(params()).toEqual({ page: '1', genre: 'Terror' });
    request().flush(testBookPage({ page: 1 }));
    expect(page.filtersForm.controls.genre.value).toBe('Draft');
  });
  it('detail/edit links and edit Cancel preserve every normalized filter through shared context helpers', async () => {
    const url =
      '/books?page=2&size=50&sortBy=author&title=Dune&readingStatus=READING&readingStatus=READ&ratingMin=4&yearFrom=2020&yearTo=2021&genre=Terror&language=es&publisher=Press';
    await loaded(url);
    const context = params();
    harness
      .routeNativeElement!.querySelector<HTMLAnchorElement>('a[aria-label^="Ver detalle de "]')!
      .click();
    await stable();
    expect(params()).toEqual(context);
    const detail = http.expectOne('/api/books/1');
    expect(detail.request.params.keys()).toEqual([]);
    detail.flush(testBook());
    await stable();
    Array.from(harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('a'))
      .find((item) => item.textContent?.trim() === 'Editar')!
      .click();
    await stable();
    expect(params()).toEqual(context);
    http.expectOne('/api/books/1').flush(testBook());
    await stable();
    button('Cancelar').click();
    await stable();
    expect(params()).toEqual(context);
    const back = request();
    expect(back.request.params.getAll('readingStatus')).toEqual(['READING', 'READ']);
    back.flush(testBookPage());
  });
  it('detail back-to-catalog preserves filters', async () => {
    await loaded('/books?genre=Terror&ratingMin=4');
    const context = params();
    harness
      .routeNativeElement!.querySelector<HTMLAnchorElement>('a[aria-label^="Ver detalle de "]')!
      .click();
    await stable();
    http.expectOne('/api/books/1').flush(testBook());
    await stable();
    Array.from(harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('a'))
      .find((item) => item.textContent?.trim() === 'Volver al catálogo')!
      .click();
    await stable();
    expect(params()).toEqual(context);
    request().flush(testBookPage());
  });
  it('filtered empty result is no matches, not an empty library', async () => {
    await enter('/books?genre=Terror');
    request().flush(testBookPage({ content: [], totalElements: 0, totalPages: 0 }));
    await stable();
    expect(harness.routeNativeElement!.textContent).toContain('No se encontraron libros');
  });
  it.each(['scanner', 'manual'])(
    '%s ISBN action never transports filters or search into creation',
    async (mode) => {
      await loaded('/books?page=2&title=Dune&readingStatus=READ&ratingMin=4&genre=Terror');
      const result = new Subject<string | undefined>();
      const close = vi.fn();
      vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
        afterClosed: () => result.asObservable(),
        close,
      } as unknown as MatDialogRef<BookIsbnImportDialog, string>);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(false);
      if (mode === 'scanner') page.openScanner();
      else page.openIsbnImport();
      result.next('9780306406157');
      result.next('9780306406157');
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/books/new'], {
        queryParams: { isbn: '9780306406157' },
      });
      http.expectNone((req) => req.method === 'POST' || req.url.includes('isbn-lookup'));
    },
  );
});
