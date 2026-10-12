import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BookCard } from '../../components/book-card/book-card';
import { BookReadingDatesDialog } from '../../components/book-reading-dates-dialog/book-reading-dates-dialog';
import { BookResponse } from '../../models/book.models';
import { testBook, testBookPage } from '../../models/book.testing';
import { localDateString, parseLocalDate } from '../../models/reading-date';
import { BooksCatalog } from './books-catalog';
import {
  provideCatalogRoutingTesting,
  setCatalogPageTesting,
} from './books-catalog-routing.testing';

describe('BooksCatalog reading dates', () => {
  let fixture: ComponentFixture<BooksCatalog>;
  let http: HttpTestingController;
  const original = () => testBook({ startedOn: '2026-01-01', finishedOn: '2026-12-31' });
  const page = (content: BookResponse[] = [original(), testBook({ id: 2 })]) =>
    testBookPage({ content, page: 1, size: 50, totalElements: 101, totalPages: 3 });
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BooksCatalog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideCatalogRoutingTesting(),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    });
    fixture = TestBed.createComponent(BooksCatalog);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    setCatalogPageTesting(1, 50);
    get().flush(page());
    fixture.detectChanges();
  });
  afterEach(() => http.verify());
  function get(search = false) {
    return http.expectOne((req) => req.url === (search ? '/api/books/search' : '/api/books'));
  }
  function cards() {
    return fixture.debugElement
      .queryAll(By.directive(BookCard))
      .map((element) => element.componentInstance as BookCard);
  }
  async function openDates(id = 1) {
    fixture.componentInstance.openReadingDatesDialog(id);
    await fixture.whenStable();
    return TestBed.inject(MatDialog).openDialogs.find(
      (ref) => ref.componentInstance instanceof BookReadingDatesDialog,
    )!;
  }
  async function button(text: string) {
    return TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
      MatButtonHarness.with({ text }),
    );
  }
  function expectCurrentQuery(request: ReturnType<typeof get>, sortBy = 'title') {
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('50');
    expect(request.request.params.get('sortBy')).toBe(sortBy);
  }

  it('should wire card start/finish/date actions to catalog HTTP and the dedicated dialog', async () => {
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const starts = await loader.getAllHarnesses(MatButtonHarness.with({ text: 'Empezar lectura' }));
    await starts[0].click();
    http.expectOne('/api/books/1/start-reading').flush({ ...original(), readingStatus: 'READING' });
    await fixture.whenStable();
    const buttons = await loader.getAllHarnesses(
      MatButtonHarness.with({ text: 'Finalizar lectura' }),
    );
    await buttons[0].click();
    http.expectOne('/api/books/1/finish-reading').flush({ ...original(), readingStatus: 'READ' });
    await fixture.whenStable();
    const dates = await loader.getAllHarnesses(MatButtonHarness.with({ text: 'Gestionar fechas' }));
    await dates[0].click();
    expect(TestBed.inject(MatDialog).openDialogs[0].componentInstance).toBeInstanceOf(
      BookReadingDatesDialog,
    );
    await (await button('Cancelar')).click();
  });

  it('should keep the submitted query through a locally replaced date response', async () => {
    fixture.componentInstance.searchForm.controls.author.setValue('Herbert');
    fixture.componentInstance.submitSearch();
    setCatalogPageTesting(1, 50);
    get(true).flush(page());
    fixture.componentInstance.onSortByChange('author');
    setCatalogPageTesting(1, 50);
    get(true).flush(page());
    fixture.componentInstance.onSortDirectionChange('DESC');
    setCatalogPageTesting(1, 50);
    get(true).flush(page());
    const ref = await openDates();
    const dialog = ref.componentInstance as BookReadingDatesDialog;
    dialog.save();
    http.expectOne('/api/books/1/reading-dates').flush({ ...original(), startedOn: '2026-02-01' });
    await fixture.whenStable();
    expect(fixture.componentInstance.currentSearch()).toEqual({ author: 'Herbert' });
    expect(fixture.componentInstance.currentSort()).toEqual({
      sortBy: 'author',
      direction: 'DESC',
    });
    expect(cards()[0].book().startedOn).toBe('2026-02-01');
    http.expectNone((req) => req.method === 'GET');
  });

  it('should prevent duplicate dialog operations and retain values on a network error', async () => {
    const ref = await openDates();
    const dialog = ref.componentInstance as BookReadingDatesDialog;
    dialog.save();
    const request = http.expectOne('/api/books/1/reading-dates');
    dialog.save();
    dialog.remove();
    dialog.cancel();
    fixture.componentInstance.finishReading(1);
    fixture.componentInstance.updateReadingStatus({ id: 1, status: 'READ' });
    http.expectNone('/api/books/1/reading-dates');
    http.expectNone('/api/books/1/finish-reading');
    http.expectNone('/api/books/1/reading-status');
    request.error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(dialog.error()).toBe('No se puede conectar con el servidor');
    expect(dialog.pending()).toBe(false);
    expect(cards()[0].book()).toEqual(original());
    dialog.save();
    http.expectOne('/api/books/1/reading-dates').flush(original());
  });

  it('should retain changed search results rather than reinsert an old book when a quick write completes', () => {
    fixture.componentInstance.startReading(1);
    const write = http.expectOne('/api/books/1/start-reading');
    fixture.componentInstance.searchForm.controls.title.setValue('Other');
    fixture.componentInstance.submitSearch();
    get(true).flush(testBookPage({ content: [testBook({ id: 9 })] }));
    write.flush({ ...original(), readingStatus: 'READING' });
    const reload = get(true);
    expect(reload.request.params.get('title')).toBe('Other');
    expect(reload.request.params.get('page')).toBe('0');
    reload.flush(testBookPage({ content: [testBook({ id: 9 })] }));
    fixture.detectChanges();
    expect(cards().map((card) => card.book().id)).toEqual([9]);
  });

  it.each(['start', 'finish'] as const)(
    'should %s with today from local components, keep confirmed data while pending, and apply only the backend response',
    async (action) => {
      const today = localDateString(new Date());
      const iso = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
        throw new Error('UTC forbidden');
      });
      try {
        if (action === 'start') fixture.componentInstance.startReading(1);
        else fixture.componentInstance.finishReading(1);
        const request = http.expectOne(`/api/books/1/${action}-reading`);
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ date: today });
        expect(cards()[0].book()).toEqual(original());
        expect(fixture.componentInstance.pendingUpdates().get(1)).toBe(
          action === 'start' ? 'startReading' : 'finishReading',
        );
        const response =
          action === 'start'
            ? { ...original(), startedOn: today, readingStatus: 'READING' as const }
            : { ...original(), finishedOn: today, readingStatus: 'READ' as const };
        request.flush(response);
        await fixture.whenStable();
        expect(cards()[0].book()).toEqual(response);
        expect(cards()[1].book().id).toBe(2);
        expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
        expect(fixture.componentInstance.currentSort()).toEqual({
          sortBy: 'title',
          direction: 'ASC',
        });
        http.expectNone((req) => req.method === 'GET');
        expect(iso).not.toHaveBeenCalled();
      } finally {
        iso.mockRestore();
      }
    },
  );

  it('should finish from READING and preserve a missing startedOn when backend does', async () => {
    fixture.componentInstance.updateReadingStatus({ id: 2, status: 'READING' });
    http
      .expectOne('/api/books/2/reading-status')
      .flush(testBook({ id: 2, readingStatus: 'READING' }));
    fixture.componentInstance.finishReading(2);
    http
      .expectOne('/api/books/2/finish-reading')
      .flush(testBook({ id: 2, readingStatus: 'READ', finishedOn: '2026-10-12', startedOn: null }));
    await fixture.whenStable();
    expect(cards()[1].book().startedOn).toBeNull();
    expect(cards()[1].book().readingStatus).toBe('READ');
  });

  it.each(['READ', 'ABANDONED'] as const)(
    'should guard disallowed transitions from %s',
    (readingStatus) => {
      fixture.componentInstance.updateReadingStatus({ id: 1, status: readingStatus });
      http.expectOne('/api/books/1/reading-status').flush({ ...original(), readingStatus });
      fixture.componentInstance.startReading(1);
      fixture.componentInstance.finishReading(1);
      fixture.componentInstance.startReading(99);
      http.expectNone((req) => req.method === 'POST');
    },
  );

  it.each(['start', 'finish'] as const)(
    'should reload current server order after %s when sorted by readingStatus',
    async (action) => {
      fixture.componentInstance.onSortByChange('readingStatus');
      setCatalogPageTesting(1, 50);
      get().flush(page());
      await fixture.whenStable();
      if (action === 'start') fixture.componentInstance.startReading(1);
      else fixture.componentInstance.finishReading(1);
      http
        .expectOne(`/api/books/1/${action}-reading`)
        .flush({ ...original(), readingStatus: 'READ' });
      const reload = get();
      expectCurrentQuery(reload, 'readingStatus');
      reload.flush(page([testBook({ id: 2 }), { ...original(), readingStatus: 'READ' }]));
      await fixture.whenStable();
      expect(cards().map((card) => card.book().id)).toEqual([2, 1]);
    },
  );

  it('should PUT edited dates without changing status, close the dialog and preserve query totals', async () => {
    fixture.componentInstance.onSortByChange('readingStatus');
    setCatalogPageTesting(1, 50);
    get().flush(page());
    const ref = await openDates();
    const dialog = ref.componentInstance as BookReadingDatesDialog;
    dialog.form.setValue({ startedOn: null, finishedOn: parseLocalDate('2024-02-29') });
    dialog.save();
    const request = http.expectOne('/api/books/1/reading-dates');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ startedOn: null, finishedOn: '2024-02-29' });
    expect(dialog.pending()).toBe(true);
    expect(ref.disableClose).toBe(true);
    expect(cards()[0].book()).toEqual(original());
    const confirmed = { ...original(), startedOn: null, finishedOn: '2024-02-29' };
    request.flush(confirmed);
    await fixture.whenStable();
    expect(cards()[0].book()).toEqual(confirmed);
    http.expectNone((req) => req.method === 'GET');
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    const paginator = fixture.nativeElement.querySelector('mat-paginator') as HTMLElement;
    expect(paginator.textContent).toContain('101');
  });

  it('should DELETE dates bodylessly, retain confirmed dates until 204 and then reload current page', async () => {
    const ref = await openDates();
    const dialog = ref.componentInstance as BookReadingDatesDialog;
    dialog.remove();
    const request = http.expectOne('/api/books/1/reading-dates');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    expect(cards()[0].book()).toEqual(original());
    request.flush(null, { status: 204, statusText: 'No Content' });
    const reload = get();
    expectCurrentQuery(reload);
    reload.flush(page([{ ...original(), startedOn: null, finishedOn: null }]));
    await fixture.whenStable();
    expect(cards()[0].book().readingStatus).toBe('TO_READ');
    expect(cards()[0].book().startedOn).toBeNull();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
  });

  it('should block Escape/backdrop during a write and allow cancel again after error', async () => {
    const ref = await openDates();
    const dialog = ref.componentInstance as BookReadingDatesDialog;
    dialog.save();
    const request = http.expectOne('/api/books/1/reading-dates');
    const root = fixture.nativeElement.ownerDocument as Document;
    root
      .querySelector('.cdk-overlay-backdrop')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root
      .querySelector('.cdk-overlay-pane')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await fixture.whenStable();
    expect(TestBed.inject(MatDialog).openDialogs).toContain(ref);
    expect(dialog.pending()).toBe(true);
    request.flush({}, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(ref.disableClose).toBe(false);
    await (await button('Cancelar')).click();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
  });

  it.each([
    [0, 'No se puede conectar con el servidor'],
    [400, 'No se pudieron actualizar las fechas de lectura'],
    [404, 'El libro ya no existe'],
    [409, 'El estado actual del libro no permite esta acción'],
    [500, 'El servidor no pudo actualizar las fechas de lectura'],
    [403, 'No se pudieron actualizar las fechas de lectura'],
  ])(
    'should preserve the card on quick-action error %s and allow explicit retry',
    async (status, message) => {
      fixture.componentInstance.startReading(1);
      const request = http.expectOne('/api/books/1/start-reading');
      if (status === 0) request.error(new ProgressEvent('error'));
      else request.flush({ detail: 'PRIVATE' }, { status, statusText: 'Error' });
      await fixture.whenStable();
      expect(cards()[0].book()).toEqual(original());
      expect(fixture.componentInstance.updateErrors().get(1)).toBe(message);
      expect(fixture.nativeElement.textContent).not.toContain('PRIVATE');
      expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
      fixture.componentInstance.startReading(1);
      expect(fixture.componentInstance.updateErrors().has(1)).toBe(false);
      http
        .expectOne('/api/books/1/start-reading')
        .flush({ ...original(), readingStatus: 'READING' });
    },
  );

  it.each([false, true])(
    'should keep edited values and safe errors in the dialog after failed PUT/DELETE (delete=%s)',
    async (remove) => {
      const ref = await openDates();
      const dialog = ref.componentInstance as BookReadingDatesDialog;
      const inputs = await TestbedHarnessEnvironment.documentRootLoader(fixture).getAllHarnesses(
        MatInputHarness.with({ selector: 'app-book-reading-dates-dialog input' }),
      );
      await inputs[0].setValue('2024-02-29');
      if (remove) dialog.remove();
      else dialog.save();
      http
        .expectOne('/api/books/1/reading-dates')
        .flush({ detail: 'PRIVATE' }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      expect(TestBed.inject(MatDialog).openDialogs).toContain(ref);
      expect(dialog.pending()).toBe(false);
      expect(await inputs[0].getValue()).toBe('2024-02-29');
      expect(dialog.error()).toBe('El servidor no pudo actualizar las fechas de lectura');
      expect(cards()[0].book()).toEqual(original());
      expect(
        fixture.nativeElement.ownerDocument.querySelector(
          'app-book-reading-dates-dialog [role="alert"]',
        )?.textContent,
      ).toContain('El servidor no pudo actualizar');
      dialog.cancel();
    },
  );

  it('should allow different books in parallel, block a second action on the same book and block DELETE book', () => {
    fixture.componentInstance.startReading(1);
    const first = http.expectOne('/api/books/1/start-reading');
    fixture.componentInstance.finishReading(1);
    fixture.componentInstance.updateRating({ id: 1, rating: 4 });
    fixture.componentInstance.openReadingDatesDialog(1);
    fixture.componentInstance.openDeleteDialog(original());
    http.expectNone('/api/books/1/finish-reading');
    http.expectNone('/api/books/1/rating');
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
    fixture.componentInstance.finishReading(2);
    const second = http.expectOne('/api/books/2/finish-reading');
    expect(fixture.componentInstance.pendingUpdates().size).toBe(2);
    first.flush({ ...original(), readingStatus: 'READING' });
    second.flush(testBook({ id: 2, readingStatus: 'READ' }));
    expect(fixture.componentInstance.pendingUpdates().size).toBe(0);
  });

  it('should guard updates and dialog opening during an active DELETE book', async () => {
    fixture.componentInstance.openDeleteDialog(original());
    await fixture.whenStable();
    await (
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatButtonHarness.with({ selector: '.confirm-delete' }),
      )
    ).click();
    await vi.waitFor(() => expect(fixture.componentInstance.deletingId()).toBe(1));
    const deletion = http.expectOne('/api/books/1');
    fixture.componentInstance.startReading(2);
    fixture.componentInstance.finishReading(2);
    fixture.componentInstance.openReadingDatesDialog(2);
    http.expectNone((req) => /start-reading|finish-reading|reading-dates/.test(req.url));
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    get().flush(page([testBook({ id: 2 })]));
  });

  it('should recheck pending dates before confirming an already-open book deletion', async () => {
    fixture.componentInstance.openDeleteDialog(original());
    await fixture.whenStable();
    fixture.componentInstance.startReading(2);
    const update = http.expectOne('/api/books/2/start-reading');
    await (
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatButtonHarness.with({ selector: '.confirm-delete' }),
      )
    ).click();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    http.expectNone((req) => req.method === 'DELETE');
    update.flush(testBook({ id: 2, readingStatus: 'READING' }));
  });

  it('should cancel an old pending GET and reload the currently selected page after a date write', () => {
    fixture.componentInstance.startReading(1);
    const write = http.expectOne('/api/books/1/start-reading');
    fixture.componentInstance.onPageChange({ pageIndex: 2, pageSize: 50, length: 101 });
    const old = get();
    write.flush({ ...original(), readingStatus: 'READING' });
    expect(old.cancelled).toBe(true);
    const reload = get();
    expect(reload.request.params.get('page')).toBe('2');
    reload.flush(testBookPage({ page: 2, size: 50, content: [testBook({ id: 9 })] }));
    fixture.detectChanges();
    expect(cards().map((card) => card.book().id)).toEqual([9]);
  });

  it('should preserve submitted search, sorting, page and size after clearing dates', async () => {
    fixture.componentInstance.searchForm.controls.title.setValue('Dune');
    fixture.componentInstance.submitSearch();
    setCatalogPageTesting(1, 50);
    get(true).flush(page());
    fixture.componentInstance.onSortByChange('rating');
    setCatalogPageTesting(1, 50);
    get(true).flush(page());
    fixture.componentInstance.onSortDirectionChange('DESC');
    setCatalogPageTesting(1, 50);
    get(true).flush(page());
    fixture.componentInstance.searchForm.controls.title.setValue('Unsubmitted');
    const ref = await openDates();
    (ref.componentInstance as BookReadingDatesDialog).remove();
    http
      .expectOne('/api/books/1/reading-dates')
      .flush(null, { status: 204, statusText: 'No Content' });
    const reload = get(true);
    expectCurrentQuery(reload, 'rating');
    expect(reload.request.params.get('direction')).toBe('DESC');
    expect(reload.request.params.get('title')).toBe('Dune');
    reload.flush(page());
  });

  it('should treat a failed reload as a load error and never repeat the successful write', async () => {
    const ref = await openDates();
    (ref.componentInstance as BookReadingDatesDialog).remove();
    http
      .expectOne('/api/books/1/reading-dates')
      .flush(null, { status: 204, statusText: 'No Content' });
    get().flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('El servidor no pudo cargar el catálogo');
    expect(fixture.componentInstance.updateErrors().size).toBe(0);
    await (await button('Reintentar')).click();
    get().flush(page());
    http.expectNone('/api/books/1/reading-dates');
  });
});
