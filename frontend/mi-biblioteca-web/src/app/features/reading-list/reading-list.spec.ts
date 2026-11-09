import { provideHttpClient } from '@angular/common/http';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ReadingListItem } from './reading-list.models';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { BookReadingDatesDialog } from '../books/components/book-reading-dates-dialog/book-reading-dates-dialog';
import { testBook } from '../books/models/book.testing';
import { localDateString } from '../books/models/reading-date';
import { ReadingList } from './reading-list';
import { ReadingListResponse } from './reading-list.models';

const response = (): ReadingListResponse => ({
  revision: '9007199254740993',
  totalItems: 2,
  items: [
    {
      entryId: 11,
      position: 1,
      addedAt: '2026-11-01T10:00:00Z',
      book: testBook({
        id: 1,
        title: 'Primero',
        coverUrl: 'https://example.org/first.jpg',
        readingStatus: 'TO_READ',
        startedOn: null,
        finishedOn: null,
      }),
    },
    {
      entryId: 22,
      position: 2,
      addedAt: '2026-11-02T10:00:00Z',
      book: testBook({
        id: 2,
        title: 'Segundo',
        readingStatus: 'READ',
        startedOn: '2026-01-01',
        finishedOn: '2026-02-02',
      }),
    },
  ],
});

describe('ReadingList', () => {
  let fixture: ComponentFixture<ReadingList>;
  let page: ReadingList;
  let http: HttpTestingController;
  let data: ReadingListResponse;
  const dom = () => fixture.nativeElement as HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReadingList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(ReadingList);
    page = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    data = response();
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });
  function load() {
    http.expectOne('/api/reading-list').flush(data);
    fixture.detectChanges();
  }

  it('shows loading then ordered covers, dates, detail links and no catalog delete', () => {
    expect(dom().textContent).toContain('Cargando');
    load();
    expect([...dom().querySelectorAll('h2')].map((node) => node.textContent)).toEqual([
      'Primero',
      'Segundo',
    ]);
    expect(dom().querySelector('a')?.getAttribute('href')).toBe('/books/1');
    expect(dom().querySelector('.finished')?.textContent).toContain('02/02/2026');
    expect(dom().querySelectorAll('img').length).toBeGreaterThan(0);
    expect(
      [...dom().querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Eliminar'),
      ),
    ).toBe(false);
    expect(
      dom().querySelector<HTMLButtonElement>('button[aria-label="Subir Primero"]')?.disabled,
    ).toBe(true);
    expect(
      dom().querySelector<HTMLButtonElement>('button[aria-label="Bajar Segundo"]')?.disabled,
    ).toBe(true);
  });

  it('uses fallback on missing or failed covers', () => {
    data.items[0].book.coverUrl = null;
    data.items[1].book.coverUrl = 'https://example.org/a.jpg';
    load();
    dom().querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(dom().querySelectorAll('img')).toHaveLength(0);
    expect(dom().textContent?.match(/Sin portada/g)).toHaveLength(2);
  });

  it('cancels obsolete GETs, filters on server, preserves global positions and guards moves', () => {
    const old = http.expectOne('/api/reading-list');
    page.changeFilter('READ');
    expect(old.cancelled).toBe(true);
    http
      .expectOne('/api/reading-list?readingStatus=READ')
      .flush({ ...data, items: [data.items[1]] });
    fixture.detectChanges();
    expect(dom().textContent).toContain('Posición 2');
    page.move(data.items[1], -1);
    http.expectNone((request) => request.method !== 'GET');
    expect(
      dom().querySelector<HTMLButtonElement>('button[aria-label="Subir Segundo"]')?.disabled,
    ).toBe(true);
  });

  it('distinguishes empty list, no results and safe retryable loading errors', () => {
    http.expectOne('/api/reading-list').flush({ revision: '0', totalItems: 0, items: [] });
    fixture.detectChanges();
    expect(dom().textContent).toContain('está vacía');
    page.changeFilter('READING');
    http.expectOne('/api/reading-list?readingStatus=READING').flush({ ...data, items: [] });
    fixture.detectChanges();
    expect(dom().textContent).toContain('No hay libros con este estado');
    page.retry();
    http
      .expectOne('/api/reading-list?readingStatus=READING')
      .flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(dom().textContent).not.toContain('SECRET');
    expect(dom().querySelector('[role="alert"]')).not.toBeNull();
    page.retry();
    http.expectOne('/api/reading-list?readingStatus=READING').flush({ ...data, items: [] });
  });

  it('moves nonoptimistically, blocks simultaneous writes and restores focus after confirmed GET', async () => {
    load();
    page.move(data.items[0], 1);
    const move = http.expectOne('/api/reading-list/items/11/move');
    expect(move.request.body).toEqual({ toPosition: 2, expectedRevision: data.revision });
    page.remove(data.items[1]);
    page.changeFilter('READ');
    expect(page.filter()).toBeNull();
    expect(data.items[0].position).toBe(1);
    move.flush({ revision: '9007199254740994', entryId: 11, position: 2 });
    expect(page.busy()).toBe(true);
    http.expectOne('/api/reading-list').flush({
      ...data,
      revision: '9007199254740994',
      items: [
        { ...data.items[1], position: 1 },
        { ...data.items[0], position: 2 },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(page.busy()).toBe(false);
    expect([...dom().querySelectorAll('h2')].map((node) => node.textContent)).toEqual([
      'Segundo',
      'Primero',
    ]);
    expect(document.activeElement?.getAttribute('data-entry')).toBe('11');
    expect(dom().textContent).toContain('Posición de lectura actualizada');
  });

  it.each([409, 500, 0])(
    'consults current state after write error %s without retrying the write',
    (status) => {
      load();
      page.remove(data.items[0]);
      const remove = http.expectOne(`/api/reading-list/items/11?expectedRevision=${data.revision}`);
      if (status === 0) remove.error(new ProgressEvent('error'));
      else remove.flush({ detail: 'SECRET' }, { status, statusText: 'Error' });
      expect(page.notice()).toContain(status === 409 ? 'han cambiado' : 'Resultado incierto');
      http.expectOne('/api/reading-list').flush({}, { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      expect(page.busy()).toBe(true);
      expect(dom().textContent).toContain('escrituras siguen bloqueadas');
      page.remove(data.items[1]);
      page.retry();
      http.expectOne('/api/reading-list').flush({ ...data, items: [data.items[1]] });
      expect(page.busy()).toBe(false);
      http.expectNone((request) => request.method !== 'GET');
    },
  );

  it('successful removal reloads without deleting Book or repeating DELETE after failed synchronization', () => {
    load();
    page.remove(data.items[0]);
    http
      .expectOne(`/api/reading-list/items/11?expectedRevision=${data.revision}`)
      .flush({ revision: '9007199254740994' });
    http.expectOne('/api/reading-list').flush({}, { status: 500, statusText: 'Error' });
    page.retry();
    http.expectOne('/api/reading-list').flush({ ...data, items: [data.items[1]], totalItems: 1 });
    http.expectNone((request) => request.url.includes('/books/') || request.method !== 'GET');
  });

  it('uses local calendar date for quick start and finish and reloads current filter', () => {
    load();
    page.quickReading(data.items[0], 'start');
    const start = http.expectOne('/api/books/1/start-reading');
    expect(start.request.body).toEqual({ date: localDateString(new Date()) });
    start.flush(testBook({ readingStatus: 'READING' }));
    http.expectOne('/api/reading-list').flush(data);
    page.quickReading(data.items[0], 'finish');
    http.expectOne('/api/books/1/finish-reading').flush(testBook({ readingStatus: 'READ' }));
    http.expectOne('/api/reading-list').flush(data);
    page.quickReading(data.items[1], 'start');
    http.expectNone('/api/books/2/start-reading');
  });

  it('restores confirmed status before PATCH and never sends dates with a manual state change', () => {
    load();
    const source = { value: 'READ' } as MatSelect;
    page.statusChanged(data.items[0], { source, value: 'READ' } as MatSelectChange);
    expect(source.value).toBe('TO_READ');
    const patch = http.expectOne('/api/books/1/reading-status');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ readingStatus: 'READ' });
    patch.flush(testBook({ readingStatus: 'READ' }));
    http.expectOne('/api/reading-list').flush(data);
    expect(page.notice()).toContain('fechas no se han modificado');
  });

  it('reuses the date dialog, preserves failed drafts, then saves and reloads', () => {
    load();
    page.manageDates(data.items[1]);
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    const dialog = ref.componentInstance as BookReadingDatesDialog;
    const dates = { startedOn: '2026-01-01', finishedOn: '2026-02-03' };
    dialog.saveRequested.emit(dates);
    expect(dialog.pending()).toBe(true);
    expect(ref.disableClose).toBe(true);
    const put = http.expectOne('/api/books/2/reading-dates');
    expect(put.request.body).toEqual(dates);
    put.flush({}, { status: 400, statusText: 'Bad Request' });
    expect(dialog.pending()).toBe(false);
    expect(dialog.error()).not.toBeNull();
    dialog.saveRequested.emit(dates);
    http.expectOne('/api/books/2/reading-dates').flush(testBook());
    http.expectOne('/api/reading-list').flush(data);
  });

  it('deletes dates with a bodyless DELETE and reloads', () => {
    load();
    page.manageDates(data.items[1]);
    const dialog = TestBed.inject(MatDialog).openDialogs[0]
      .componentInstance as BookReadingDatesDialog;
    dialog.deleteRequested.emit();
    const request = http.expectOne('/api/books/2/reading-dates');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/reading-list').flush(data);
  });

  it('cancels pending GET and write on destruction and closes date dialog', () => {
    load();
    page.manageDates(data.items[1]);
    const dialogs = TestBed.inject(MatDialog);
    (dialogs.openDialogs[0].componentInstance as BookReadingDatesDialog).deleteRequested.emit();
    const request = http.expectOne('/api/books/2/reading-dates');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('selects every filter and returns to Todos using the Material control', async () => {
    load();
    const filter = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatSelectHarness.with({ selector: 'mat-select' }),
    );
    for (const [label, status] of [
      ['Por leer', 'TO_READ'],
      ['Leyendo', 'READING'],
      ['Leídos', 'READ'],
      ['Abandonados', 'ABANDONED'],
      ['Todos', null],
    ]) {
      await filter.open();
      await filter.clickOptions({ text: label! });
      const url = status ? `/api/reading-list?readingStatus=${status}` : '/api/reading-list';
      http.expectOne(url).flush(data);
      fixture.detectChanges();
    }
    expect(page.filter()).toBeNull();
  });

  it('does not automatically remove a read book after finishing', () => {
    load();
    page.quickReading(data.items[0], 'finish');
    const finished = testBook({
      id: 1,
      title: 'Primero',
      readingStatus: 'READ',
      finishedOn: '2026-11-09',
    });
    http.expectOne('/api/books/1/finish-reading').flush(finished);
    http
      .expectOne('/api/reading-list')
      .flush({ ...data, items: [{ ...data.items[0], book: finished }, data.items[1]] });
    fixture.detectChanges();
    expect(dom().querySelectorAll('mat-card')).toHaveLength(2);
    expect(dom().querySelector('.finished')?.textContent).toContain('09/11/2026');
    http.expectNone((request) => request.method === 'DELETE');
  });

  it.each([400, 404])('reports safe write errors %s without optimistic changes', (status) => {
    load();
    page.move(data.items[0], 1);
    http
      .expectOne('/api/reading-list/items/11/move')
      .flush({ detail: 'SECRET' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(page.busy()).toBe(false);
    expect(page.notice()).not.toContain('SECRET');
    expect([...dom().querySelectorAll('h2')].map((node) => node.textContent)).toEqual([
      'Primero',
      'Segundo',
    ]);
    http.expectNone('/api/reading-list');
  });

  it('handles uncertain date writes by closing the dialog and consulting without replay', () => {
    load();
    page.manageDates(data.items[1]);
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    const close = vi.spyOn(ref, 'close');
    (ref.componentInstance as BookReadingDatesDialog).deleteRequested.emit();
    http.expectOne('/api/books/2/reading-dates').error(new ProgressEvent('error'));
    expect(close).toHaveBeenCalledOnce();
    expect(page.notice()).toContain('Resultado incierto');
    http.expectOne('/api/reading-list').flush(data);
    http.expectNone('/api/books/2/reading-dates');
  });

  it('cancels an outstanding read on destruction', () => {
    const request = http.expectOne('/api/reading-list');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('prevents duplicate date dialogs and closes on page destruction', () => {
    load();
    page.manageDates(data.items[1]);
    page.manageDates(data.items[0]);
    const dialogs = TestBed.inject(MatDialog);
    expect(dialogs.openDialogs).toHaveLength(1);
    const close = vi.spyOn(dialogs.openDialogs[0], 'close');
    fixture.destroy();
    expect(close).toHaveBeenCalled();
  });

  function drop(from = 0, to = 1): CdkDragDrop<ReadingListItem[]> {
    const container = {};
    return {
      previousContainer: container,
      container,
      previousIndex: from,
      currentIndex: to,
      isPointerOverContainer: true,
      item: { data: data.items[from] },
    } as CdkDragDrop<ReadingListItem[]>;
  }

  it('persists a drop without changing the array optimistically, then reloads the confirmed order', async () => {
    load();
    expect(dom().querySelectorAll('.drag-handle')).toHaveLength(2);
    expect(dom().querySelector('.drag-handle')?.getAttribute('aria-label')).toContain('Primero');
    page.drop(drop());
    const request = http.expectOne('/api/reading-list/items/11/move');
    expect(request.request.body).toEqual({ toPosition: 2, expectedRevision: data.revision });
    expect(data.items.map((item) => item.entryId)).toEqual([11, 22]);
    fixture.detectChanges();
    expect(dom().querySelector<HTMLButtonElement>('.drag-handle')!.disabled).toBe(true);
    page.drop(drop());
    http.expectNone('/api/reading-list/items/11/move');
    request.flush({ revision: '9007199254740994', entryId: 11, position: 2 });
    const persisted = {
      ...data,
      revision: '9007199254740994',
      items: [
        { ...data.items[1], position: 1 },
        { ...data.items[0], position: 2 },
      ],
    };
    http.expectOne('/api/reading-list').flush(persisted);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-entry')).toBe('11');
    expect(page.notice()).toContain('actualizada: 2');
    page.retry();
    http.expectOne('/api/reading-list').flush(persisted);
    fixture.detectChanges();
    expect([...dom().querySelectorAll('h2')].map((node) => node.textContent)).toEqual([
      'Segundo',
      'Primero',
    ]);
  });

  it('ignores no-op drops, outside drops and stale dragged items', () => {
    load();
    page.drop(drop(0, 0));
    page.drop({ ...drop(), isPointerOverContainer: false });
    page.drop({ ...drop(), previousContainer: {} } as CdkDragDrop<ReadingListItem[]>);
    page.drop({ ...drop(), item: { data: { ...data.items[0] } } } as CdkDragDrop<
      ReadingListItem[]
    >);
    http.expectNone((req) => req.method === 'POST');
  });

  it('disables handles and guards drop under status filters, leaving keyboard buttons available in Todos', () => {
    load();
    page.changeFilter('READ');
    http.expectOne('/api/reading-list?readingStatus=READ').flush(data);
    fixture.detectChanges();
    expect(dom().querySelector<HTMLButtonElement>('.drag-handle')!.disabled).toBe(true);
    page.drop(drop());
    http.expectNone((req) => req.method === 'POST');
    page.changeFilter(null);
    http.expectOne('/api/reading-list').flush(data);
    fixture.detectChanges();
    const down = dom().querySelector<HTMLButtonElement>('button[aria-label="Bajar Primero"]')!;
    expect(down.disabled).toBe(false);
    down.focus();
    expect(document.activeElement).toBe(down);
    down.click();
    http
      .expectOne('/api/reading-list/items/11/move')
      .flush({ revision: '6', entryId: 11, position: 2 });
    http.expectOne('/api/reading-list').flush(data);
  });

  it.each([409, 0, 503])(
    'reconciles drop failure %s using only GET, blocking another drop until synchronized',
    (status) => {
      load();
      page.drop(drop());
      const request = http.expectOne('/api/reading-list/items/11/move');
      if (status === 0) request.error(new ProgressEvent('error'));
      else request.flush({}, { status, statusText: 'Error' });
      page.drop(drop());
      http.expectNone((req) => req.method === 'POST');
      http.expectOne('/api/reading-list').flush({}, { status: 500, statusText: 'Error' });
      page.drop(drop());
      page.retry();
      http.expectOne('/api/reading-list').flush(data);
      expect(page.busy()).toBe(false);
      expect(page.notice()).toContain(status === 409 ? 'han cambiado' : 'Resultado incierto');
    },
  );
});
