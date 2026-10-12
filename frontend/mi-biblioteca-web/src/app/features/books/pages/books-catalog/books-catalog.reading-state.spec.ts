import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatPaginator } from '@angular/material/paginator';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BookResponse, ReadingStatus } from '../../models/book.models';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';
import { BookCard } from '../../components/book-card/book-card';

describe('BooksCatalog reading state', () => {
  let fixture: ComponentFixture<BooksCatalog>;
  let element: HTMLElement;
  let http: HttpTestingController;
  const original = () => testBook({ startedOn: '2026-01-01', finishedOn: '2026-01-20' });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BooksCatalog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BooksCatalog);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    listRequest().flush(page());
    fixture.detectChanges();
  });

  afterEach(() => {
    http.expectNone((req) => /start-reading|finish-reading|reading-dates/.test(req.url));
    http.verify();
  });

  function page(content: BookResponse[] = [original(), testBook({ id: 2 })]) {
    return testBookPage({ content, page: 1, size: 50, totalElements: 101, totalPages: 3 });
  }
  function listRequest() {
    return http.expectOne((req) => req.url === '/api/books');
  }
  function searchRequest() {
    return http.expectOne((req) => req.url === '/api/books/search');
  }
  function paginator(): MatPaginator {
    return fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
  }
  async function selects() {
    return TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatSelectHarness.with({ selector: 'app-book-card mat-select' }),
    );
  }
  async function selectStatus(label = 'Leyendo') {
    const [status] = await selects();
    await status.clickOptions({ text: label });
  }
  async function selectRating(label = '4') {
    const [, rating] = await selects();
    await rating.clickOptions({ text: label });
  }
  function firstCard() {
    return element.querySelector('app-book-card')!;
  }
  function expectQuery(request: ReturnType<typeof listRequest>, sortBy: string, direction = 'ASC') {
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('50');
    expect(request.request.params.get('sortBy')).toBe(sortBy);
    expect(request.request.params.get('direction')).toBe(direction);
  }

  it.each<[ReadingStatus, string]>([
    ['READING', 'Leyendo'],
    ['READ', 'Leído'],
    ['ABANDONED', 'Abandonado'],
  ])(
    'should confirm %s by PATCH, replace only that book and retain page totals/dates',
    async (status, label) => {
      await selectStatus(label);
      const request = http.expectOne('/api/books/1/reading-status');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ readingStatus: status });
      const [control, rating] = await selects();
      expect(await control.getValueText()).toBe('Por leer');
      expect(await control.isDisabled()).toBe(true);
      expect(await rating.isDisabled()).toBe(true);
      expect(firstCard().querySelector('a')?.getAttribute('href')).toBeNull();
      expect(firstCard().textContent).toContain('Actualizando estado…');
      request.flush({ ...original(), readingStatus: status });
      await fixture.whenStable();
      expect(await control.getValueText()).toBe(label);
      expect(await control.isDisabled()).toBe(false);
      expect(
        element.querySelectorAll('app-book-card')[1].querySelector('.reading-status')?.textContent,
      ).toBe('Por leer');
      expect(paginator().pageIndex).toBe(1);
      expect(paginator().pageSize).toBe(50);
      expect(paginator().length).toBe(101);
      expect(fixture.componentInstance.currentSearch()).toBeNull();
      expect(fixture.componentInstance.currentSort()).toEqual({
        sortBy: 'title',
        direction: 'ASC',
      });
      expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
      const confirmed = fixture.debugElement.query(By.directive(BookCard))
        .componentInstance as BookCard;
      expect(confirmed.book().startedOn).toBe('2026-01-01');
      expect(confirmed.book().finishedOn).toBe('2026-01-20');
      http.expectNone((req) => req.method === 'GET');
    },
  );

  it.each([1, 2, 3, 4, 5])(
    'should PUT rating %s without null and replace the confirmed response',
    async (rating) => {
      await selectRating(String(rating));
      const request = http.expectOne('/api/books/1/rating');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ rating });
      const [, control] = await selects();
      expect(await control.getValueText()).toBe('Sin valorar');
      request.flush({ ...original(), rating });
      await fixture.whenStable();
      expect(await control.getValueText()).toBe(String(rating));
      expect(firstCard().querySelector('.reading-status')?.textContent).toBe('Por leer');
      http.expectNone((req) => req.method === 'GET');
    },
  );

  it('should change a confirmed numeric rating to another number', async () => {
    fixture.componentInstance.updateRating({ id: 1, rating: 2 });
    http.expectOne('/api/books/1/rating').flush({ ...original(), rating: 2 });
    await fixture.whenStable();
    await selectRating('5');
    const request = http.expectOne('/api/books/1/rating');
    expect(request.request.body).toEqual({ rating: 5 });
    request.flush({ ...original(), rating: 5 });
  });

  it('should DELETE rating without body and reload the same page even for unrelated sort', async () => {
    fixture.componentInstance.updateRating({ id: 1, rating: 4 });
    http.expectOne('/api/books/1/rating').flush({ ...original(), rating: 4 });
    await fixture.whenStable();
    await selectRating('Sin valorar');
    const deletion = http.expectOne('/api/books/1/rating');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.body).toBeNull();
    expect(await (await selects())[1].getValueText()).toBe('4');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    const reload = listRequest();
    expectQuery(reload, 'title');
    reload.flush(page());
    await fixture.whenStable();
    expect(await (await selects())[1].getValueText()).toBe('Sin valorar');
  });

  it('should not issue HTTP for identical values or invalid requests', async () => {
    await selectStatus('Por leer');
    await selectRating('Sin valorar');
    fixture.componentInstance.updateReadingStatus({ id: 1, status: 'TO_READ' });
    fixture.componentInstance.updateRating({ id: 1, rating: null });
    fixture.componentInstance.updateRating({ id: 1, rating: 6 });
    fixture.componentInstance.updateRating({ id: 1, rating: 1.5 });
    fixture.componentInstance.updateReadingStatus({ id: 999, status: 'READ' });
    http.expectNone((req) => req.method !== 'GET');
  });

  it.each(['readingStatus', 'rating'] as const)(
    'should reload server order when modifying the active %s sort',
    async (field) => {
      fixture.componentInstance.onSortByChange(field);
      listRequest().flush(page());
      await fixture.whenStable();
      if (field === 'readingStatus') await selectStatus();
      else await selectRating();
      http
        .expectOne(
          field === 'readingStatus' ? '/api/books/1/reading-status' : '/api/books/1/rating',
        )
        .flush({ ...original(), readingStatus: 'READING', rating: 4 });
      const reload = listRequest();
      expectQuery(reload, field);
      const confirmed = { ...original(), readingStatus: 'READING' as const, rating: 4 };
      reload.flush(page([testBook({ id: 2, title: 'First from server' }), confirmed]));
      await fixture.whenStable();
      expect(element.querySelectorAll('app-book-card h2')[0].textContent).toBe('First from server');
      expect(paginator().pageIndex).toBe(1);
    },
  );

  it('should support parallel updates on different books, guard the same book and block all book deletions', async () => {
    await selectStatus();
    const status = http.expectOne('/api/books/1/reading-status');
    fixture.componentInstance.updateRating({ id: 1, rating: 5 });
    fixture.componentInstance.updateReadingStatus({ id: 1, status: 'READ' });
    http.expectNone('/api/books/1/rating');
    http.expectNone('/api/books/1/reading-status');
    const controls = await selects();
    expect(await controls[2].isDisabled()).toBe(false);
    await controls[3].clickOptions({ text: '5' });
    const rating = http.expectOne('/api/books/2/rating');
    expect(fixture.componentInstance.pendingUpdates().size).toBe(2);
    expect(
      Array.from(element.querySelectorAll<HTMLButtonElement>('app-book-card button')).every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    fixture.componentInstance.openDeleteDialog(original());
    fixture.componentInstance.openDeleteDialog(testBook({ id: 2 }));
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
    expect(paginator().disabled).toBe(false);
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/books/new');
    rating.flush(testBook({ id: 2, rating: 5 }));
    await fixture.whenStable();
    expect(fixture.componentInstance.pendingUpdates().size).toBe(1);
    status.flush({ ...original(), readingStatus: 'READING' });
    await fixture.whenStable();
    expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
    expect(await (await selects())[0].getValueText()).toBe('Leyendo');
    expect(await (await selects())[3].getValueText()).toBe('5');
  });

  it('should recheck pending updates when an already-open deletion dialog is confirmed', async () => {
    fixture.componentInstance.openDeleteDialog(original());
    await fixture.whenStable();
    fixture.componentInstance.updateReadingStatus({ id: 2, status: 'READ' });
    const update = http.expectOne('/api/books/2/reading-status');
    await (
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatButtonHarness.with({ selector: '.confirm-delete' }),
      )
    ).click();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    http.expectNone((req) => req.method === 'DELETE');
    update.flush(testBook({ id: 2, readingStatus: 'READ' }));
  });

  it('should prevent all update types while DELETE book is active', async () => {
    fixture.componentInstance.openDeleteDialog(original());
    await fixture.whenStable();
    await (
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatButtonHarness.with({ selector: '.confirm-delete' }),
      )
    ).click();
    await vi.waitFor(() => expect(fixture.componentInstance.deletingId()).toBe(1));
    const deletion = http.expectOne('/api/books/1');
    fixture.componentInstance.updateReadingStatus({ id: 2, status: 'READ' });
    fixture.componentInstance.updateRating({ id: 2, rating: 5 });
    fixture.componentInstance.updateRating({ id: 1, rating: null });
    http.expectNone((req) => req.url.includes('/rating') || req.url.includes('/reading-status'));
    expect((await selects()).length).toBe(4);
    for (const control of await selects()) expect(await control.isDisabled()).toBe(true);
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    listRequest().flush(page([testBook({ id: 2 })]));
  });

  it.each([
    [0, 'No se puede conectar con el servidor'],
    [400, 'No se pudo actualizar el libro'],
    [404, 'El libro ya no existe'],
    [500, 'El servidor no pudo actualizar el libro'],
    [409, 'No se pudo actualizar el libro'],
  ])(
    'should preserve confirmed values on error %s and allow an explicit retry',
    async (code, message) => {
      await selectStatus();
      const request = http.expectOne('/api/books/1/reading-status');
      if (code === 0) request.error(new ProgressEvent('error'));
      else
        request.flush({ detail: 'SECRET', title: 'SECRET' }, { status: code, statusText: 'Error' });
      await fixture.whenStable();
      expect(firstCard().querySelector('[role="alert"]')?.textContent).toBe(message);
      expect(element.textContent).not.toContain('SECRET');
      expect(await (await selects())[0].getValueText()).toBe('Por leer');
      expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
      expect(firstCard().querySelector('a')?.getAttribute('href')).toBe('/books/1/edit');
      http.expectNone((req) => req.method === 'GET');
      await selectStatus();
      expect(firstCard().querySelector('[role="alert"]')).toBeNull();
      http
        .expectOne('/api/books/1/reading-status')
        .flush({ ...original(), readingStatus: 'READING' });
    },
  );

  it.each([false, true])(
    'should retain rating when a PUT or DELETE fails (delete=%s)',
    async (remove) => {
      fixture.componentInstance.updateRating({ id: 1, rating: 4 });
      http.expectOne('/api/books/1/rating').flush({ ...original(), rating: 4 });
      await fixture.whenStable();
      await selectRating(remove ? 'Sin valorar' : '5');
      http.expectOne('/api/books/1/rating').flush({}, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      expect(await (await selects())[1].getValueText()).toBe('4');
      expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
      http.expectNone((req) => req.method === 'GET');
    },
  );

  it('should retain active search, sort and size when reloading a confirmed rating change', async () => {
    fixture.componentInstance.searchForm.controls.title.setValue('Dune');
    fixture.componentInstance.submitSearch();
    searchRequest().flush(page());
    fixture.componentInstance.onSortByChange('rating');
    searchRequest().flush(page());
    fixture.componentInstance.onSortDirectionChange('DESC');
    searchRequest().flush(page());
    await fixture.whenStable();
    fixture.componentInstance.searchForm.controls.title.setValue('Not submitted');
    await selectRating();
    http.expectOne('/api/books/1/rating').flush({ ...original(), rating: 4 });
    const reload = searchRequest();
    expectQuery(reload, 'rating', 'DESC');
    expect(reload.request.params.get('title')).toBe('Dune');
    reload.flush(page([{ ...original(), rating: 4 }]));
    await fixture.whenStable();
    expect(fixture.componentInstance.currentSearch()).toEqual({ title: 'Dune' });
    expect(fixture.componentInstance.currentSort()).toEqual({
      sortBy: 'rating',
      direction: 'DESC',
    });
    expect(paginator().pageIndex).toBe(1);
    expect(paginator().pageSize).toBe(50);
  });

  it('should preserve search and sort during local replacement without a GET', async () => {
    fixture.componentInstance.searchForm.controls.author.setValue('Herbert');
    fixture.componentInstance.submitSearch();
    searchRequest().flush(page());
    fixture.componentInstance.onSortByChange('author');
    searchRequest().flush(page());
    await fixture.whenStable();
    await selectStatus();
    http.expectOne('/api/books/1/reading-status').flush({ ...original(), readingStatus: 'READ' });
    await fixture.whenStable();
    expect(fixture.componentInstance.currentSearch()).toEqual({ author: 'Herbert' });
    expect(fixture.componentInstance.currentSort().sortBy).toBe('author');
    expect(paginator().length).toBe(101);
    expect(paginator().pageIndex).toBe(1);
    http.expectNone((req) => req.method === 'GET');
  });

  it('should cancel an older pending GET after write confirmation and reload the current page', async () => {
    await selectStatus();
    const update = http.expectOne('/api/books/1/reading-status');
    fixture.componentInstance.onPageChange({ pageIndex: 2, pageSize: 50, length: 101 });
    const old = listRequest();
    update.flush({ ...original(), readingStatus: 'READING' });
    expect(old.cancelled).toBe(true);
    const latest = listRequest();
    expect(latest.request.params.get('page')).toBe('2');
    expect(latest.request.params.get('size')).toBe('50');
    latest.flush(
      testBookPage({ page: 2, size: 50, content: [testBook({ id: 9, title: 'Current page' })] }),
    );
    await fixture.whenStable();
    expect(element.textContent).toContain('Current page');
    expect(element.querySelectorAll('app-book-card')).toHaveLength(1);
    expect(() => old.flush(page())).toThrow();
  });

  it('should reload the current search rather than insert an old book after navigation has completed', async () => {
    await selectStatus();
    const update = http.expectOne('/api/books/1/reading-status');
    fixture.componentInstance.searchForm.controls.title.setValue('Other');
    fixture.componentInstance.submitSearch();
    searchRequest().flush(testBookPage({ content: [testBook({ id: 9 })] }));
    await fixture.whenStable();
    update.flush({ ...original(), readingStatus: 'READING' });
    const reload = searchRequest();
    expect(reload.request.params.get('title')).toBe('Other');
    expect(reload.request.params.get('page')).toBe('0');
    reload.flush(testBookPage({ content: [testBook({ id: 9 })] }));
    await fixture.whenStable();
    expect(element.querySelectorAll('app-book-card')).toHaveLength(1);
    expect(element.querySelector('app-book-card a')?.getAttribute('href')).toBe('/books/9/edit');
  });

  it('should cancel intermediate GETs when concurrent writes both require a reload', async () => {
    fixture.componentInstance.onSortByChange('rating');
    listRequest().flush(page());
    await fixture.whenStable();
    fixture.componentInstance.updateRating({ id: 1, rating: 3 });
    fixture.componentInstance.updateRating({ id: 2, rating: 5 });
    const first = http.expectOne('/api/books/1/rating');
    const second = http.expectOne('/api/books/2/rating');
    first.flush({ ...original(), rating: 3 });
    const old = listRequest();
    second.flush(testBook({ id: 2, rating: 5 }));
    expect(old.cancelled).toBe(true);
    listRequest().flush(page([{ ...original(), rating: 3 }, testBook({ id: 2, rating: 5 })]));
    await fixture.whenStable();
    expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
  });

  it('should report a failed reload as a catalog load error, never repeat the successful write', async () => {
    fixture.componentInstance.onSortByChange('readingStatus');
    listRequest().flush(page());
    await fixture.whenStable();
    await selectStatus();
    http
      .expectOne('/api/books/1/reading-status')
      .flush({ ...original(), readingStatus: 'READING' });
    listRequest().flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'El servidor no pudo cargar el catálogo',
    );
    expect(fixture.componentInstance.updateErrors().size).toBe(0);
    await (
      await TestbedHarnessEnvironment.loader(fixture).getHarness(
        MatButtonHarness.with({ text: 'Reintentar' }),
      )
    ).click();
    const retry = listRequest();
    expectQuery(retry, 'readingStatus');
    retry.flush(page());
    http.expectNone((req) => req.method === 'PATCH');
  });

  it('should reload search with its snapshot and unrelated sorting after clearing a rating', async () => {
    fixture.componentInstance.searchForm.controls.isbn.setValue('9780306406157');
    fixture.componentInstance.submitSearch();
    searchRequest().flush(page([{ ...original(), rating: 3 }]));
    fixture.componentInstance.onSortByChange('createdAt');
    searchRequest().flush(page([{ ...original(), rating: 3 }]));
    await fixture.whenStable();
    await selectRating('Sin valorar');
    http.expectOne('/api/books/1/rating').flush(null, { status: 204, statusText: 'No Content' });
    const reload = searchRequest();
    expectQuery(reload, 'createdAt');
    expect(reload.request.params.get('isbn')).toBe('9780306406157');
    reload.flush(page());
  });

  it('should keep errors and pending state isolated between concurrent book updates', async () => {
    fixture.componentInstance.updateReadingStatus({ id: 1, status: 'READ' });
    fixture.componentInstance.updateRating({ id: 2, rating: 5 });
    http
      .expectOne('/api/books/1/reading-status')
      .flush({}, { status: 400, statusText: 'Bad Request' });
    expect(fixture.componentInstance.pendingUpdates().has(1)).toBe(false);
    expect(fixture.componentInstance.pendingUpdates().has(2)).toBe(true);
    http.expectOne('/api/books/2/rating').flush(testBook({ id: 2, rating: 5 }));
    await fixture.whenStable();
    expect(firstCard().querySelector('[role="alert"]')?.textContent).toBe(
      'No se pudo actualizar el libro',
    );
    expect(element.querySelectorAll('app-book-card')[1].querySelector('[role="alert"]')).toBeNull();
    expect(await (await selects())[3].getValueText()).toBe('5');
  });

  it('should cancel pending writes and release pending state when the catalog is destroyed', () => {
    fixture.componentInstance.updateReadingStatus({ id: 1, status: 'READ' });
    fixture.componentInstance.updateRating({ id: 2, rating: 5 });
    const status = http.expectOne('/api/books/1/reading-status');
    const rating = http.expectOne('/api/books/2/rating');
    fixture.destroy();
    expect(status.cancelled).toBe(true);
    expect(rating.cancelled).toBe(true);
    expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
  });
});
