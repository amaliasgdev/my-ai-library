import { DatePipe } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { BookDeleteDialog } from '../../components/book-delete-dialog/book-delete-dialog';
import { BookResponse, ReadingStatus } from '../../models/book.models';
import { testBook } from '../../models/book.testing';
import { BookDetail } from './book-detail';

describe('BookDetail', () => {
  let fixture: ComponentFixture<BookDetail>;
  let page: BookDetail;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: '42' }));
    TestBed.configureTestingModule({
      imports: [BookDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BookDetail);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.inject(MatDialog).closeAll();
    http.verify();
  });
  function load(overrides: Partial<BookResponse> = {}) {
    const book = testBook({ id: 42, ...overrides });
    http.expectOne('/api/books/42').flush(book);
    fixture.detectChanges();
    return book;
  }
  function link(text: string) {
    return Array.from(element.querySelectorAll<HTMLAnchorElement>('a')).find(
      (a) => a.textContent?.trim() === text,
    )!;
  }
  async function confirm() {
    page.openDeleteDialog();
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const dialog = await loader.getHarness(MatDialogHarness);
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Eliminar' }))).click();
    await vi.waitFor(() => expect(page.deleting()).toBe(true));
    return http.expectOne('/api/books/42');
  }

  it('announces initial loading and requests the exact GET id', () => {
    expect(page.state().status).toBe('loading');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Cargando libro');
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    const req = http.expectOne('/api/books/42');
    expect(req.request.method).toBe('GET');
    req.flush(testBook({ id: 42 }));
  });
  it.each(['0', '-1', 'new', 'abc', ' 42', '42 ', '4.2', '9007199254740992', ''])(
    'rejects invalid id %s without a backend call or retry',
    (id) => {
      const previous = http.expectOne('/api/books/42');
      params.next(convertToParamMap({ id }));
      fixture.detectChanges();
      expect(previous.cancelled).toBe(true);
      expect(element.querySelector('[role="alert"]')?.textContent).toBe(
        'El identificador del libro no es válido',
      );
      expect(element.textContent).not.toContain('Reintentar');
      page.retry();
      http.expectNone((req) => req.method === 'GET');
    },
  );
  it('accepts a digit-only id with leading zeros', () => {
    http.expectOne('/api/books/42').flush(testBook());
    params.next(convertToParamMap({ id: '00043' }));
    http.expectOne('/api/books/43').flush(testBook({ id: 43 }));
    expect(page.state().status).toBe('loaded');
  });

  it('never starts HTTP for an initially invalid or missing id', () => {
    const first = http.expectOne('/api/books/42');
    fixture.destroy();
    expect(first.cancelled).toBe(true);
    params.next(convertToParamMap({}));
    fixture = TestBed.createComponent(BookDetail);
    page = fixture.componentInstance;
    fixture.detectChanges();
    expect(page.state()).toEqual({
      status: 'error',
      id: null,
      message: 'El identificador del libro no es válido',
    });
    page.retry();
    http.expectNone((request) => request.method === 'GET');
  });

  it.each([1, 2, 3, 4, 5])('renders rating %s without interactive controls', (rating) => {
    load({ rating });
    expect(element.textContent).toContain(`${rating}/5`);
    expect(element.querySelector('mat-select')).toBeNull();
  });
  it.each([
    [404, 'El libro no existe'],
    [0, 'No se puede conectar con el servidor'],
    [500, 'No se pudo cargar el libro'],
    [400, 'No se pudo cargar el libro'],
  ])('handles GET %s and retries only the current GET', (status, message) => {
    const request = http.expectOne('/api/books/42');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ detail: 'PRIVATE' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('PRIVATE');
    const retry = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Reintentar',
    )!;
    retry.click();
    page.retry();
    const retried = http.expectOne('/api/books/42');
    expect(retried.request.method).toBe('GET');
    retried.flush(testBook({ id: 42 }));
    expect(page.state().status).toBe('loaded');
  });
  it('cancels the old GET and never applies stale data after a route change', () => {
    const old = http.expectOne('/api/books/42');
    params.next(convertToParamMap({ id: '43' }));
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    expect(page.state().status).toBe('loading');
    expect(() => old.flush(testBook({ title: 'OLD' }))).toThrow();
    http.expectOne('/api/books/43').flush(testBook({ id: 43, title: 'NEW' }));
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe('NEW');
  });
  it('clears a loaded book immediately on route change and resets image failure', () => {
    load({ coverUrl: 'https://images.test/old.png' });
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    params.next(convertToParamMap({ id: '43' }));
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Autora de prueba');
    expect(element.querySelector('img')).toBeNull();
    http
      .expectOne('/api/books/43')
      .flush(testBook({ id: 43, coverUrl: 'https://images.test/new.png' }));
    fixture.detectChanges();
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://images.test/new.png');
  });
  it('retries only the new id after an earlier route failed', () => {
    http.expectOne('/api/books/42').flush({}, { status: 500, statusText: 'Error' });
    params.next(convertToParamMap({ id: '43' }));
    http.expectOne('/api/books/43').flush({}, { status: 404, statusText: 'Error' });
    page.retry();
    http.expectNone('/api/books/42');
    http.expectOne('/api/books/43').flush(testBook({ id: 43 }));
  });
  it('renders all bibliographic data, unchanged image URL, chips in order and local timestamps', () => {
    const book = load({
      isbn: '9780132350884',
      publisher: 'Editorial',
      publicationYear: 2008,
      pageCount: 464,
      language: 'en',
      genres: ['Software', 'Programming'],
      coverUrl: 'https://images.test/cover.jpg?q=1',
      description: 'First line\nSecond line',
      rating: 4,
      readingStatus: 'READ',
      startedOn: '2026-01-01',
      finishedOn: '2026-03-29',
      updatedAt: '2026-10-02T18:30:00Z',
    });
    for (const value of [
      book.title,
      book.author,
      '9780132350884',
      'Editorial',
      '2008',
      '464',
      'en',
      'Leído',
      '4/5',
      '01/01/2026',
      '29/03/2026',
    ])
      expect(element.textContent).toContain(value);
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('.description')?.textContent).toBe(book.description);
    expect(
      Array.from(element.querySelectorAll('mat-chip')).map((chip) => chip.textContent?.trim()),
    ).toEqual(['Software', 'Programming']);
    const image = element.querySelector('img')!;
    expect(image.getAttribute('src')).toBe(book.coverUrl);
    expect(image.alt).toBe('Portada de Libro de prueba');
    const times = element.querySelectorAll('time');
    const pipe = new DatePipe('en-US');
    expect(times[0].textContent).toBe(pipe.transform(book.createdAt, 'dd/MM/yyyy HH:mm'));
    expect(times[1].textContent).toBe(pipe.transform(book.updatedAt, 'dd/MM/yyyy HH:mm'));
    expect(times[1].getAttribute('datetime')).toBe(book.updatedAt);
    expect(element.querySelectorAll('mat-select, input, textarea')).toHaveLength(0);
  });
  it.each(['TO_READ', 'READING', 'READ', 'ABANDONED'] as ReadingStatus[])(
    'renders status %s read-only',
    (readingStatus) => {
      load({ readingStatus });
      const labels = {
        TO_READ: 'Por leer',
        READING: 'Leyendo',
        READ: 'Leído',
        ABANDONED: 'Abandonado',
      };
      expect(element.textContent).toContain(labels[readingStatus]);
    },
  );
  it('renders null placeholders and fallback without an image', () => {
    load();
    expect(element.querySelector('.cover')?.textContent?.trim()).toBe('Sin portada');
    expect(element.textContent).toContain('Sin valorar');
    expect(element.textContent).toContain('Sin fecha');
    expect(element.textContent).toContain('Sin géneros');
    expect(element.textContent).toContain('Sin información');
    expect(element.querySelector('.description')?.textContent).toBe('Sin descripción');
  });
  it.each(['', '   '])('renders an empty description %j as absent', (description) => {
    load({ description });
    expect(element.querySelector('.description')?.textContent).toBe('Sin descripción');
  });
  it('handles image failure without issuing another GET', () => {
    load({ coverUrl: 'https://images.test/broken.png' });
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.cover')?.textContent?.trim()).toBe('Sin portada');
    http.expectNone((req) => req.method === 'GET');
  });
  it('links Editar and Volver to the correct routes', () => {
    load();
    expect(link('Editar').getAttribute('href')).toBe('/books/42/edit');
    expect(link('Volver al catálogo').getAttribute('href')).toBe('/books');
  });
  it('cancels GET when destroyed', () => {
    const request = http.expectOne('/api/books/42');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('opens the existing dialog once with cancel focus and cancel makes no request', async () => {
    load();
    page.openDeleteDialog();
    page.openDeleteDialog();
    fixture.detectChanges();
    const dialogs = TestBed.inject(MatDialog).openDialogs;
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].componentInstance).toBeInstanceOf(BookDeleteDialog);
    const dialog =
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(MatDialogHarness);
    expect(await dialog.getContentText()).toContain('Libro de prueba');
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Cancelar'));
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Cancelar' }))).click();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    http.expectNone('/api/books/42');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('confirms a single bodyless DELETE, blocks actions and navigates without a GET', async () => {
    load();
    const deletion = await confirm();
    fixture.detectChanges();
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.body).toBeNull();
    page.openDeleteDialog();
    page.retry();
    expect(link('Editar').getAttribute('href')).toBeNull();
    expect(link('Volver al catálogo').getAttribute('href')).toBeNull();
    expect(element.querySelector('button')?.disabled).toBe(true);
    http.expectNone('/api/books/42');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/books']);
    http.expectNone('/api/books/42');
  });
  it.each([
    [404, 'El libro ya no existe'],
    [0, 'No se puede conectar con el servidor'],
    [500, 'El servidor no pudo eliminar el libro'],
    [409, 'No se pudo eliminar el libro'],
  ])('keeps detail on DELETE %s and displays a safe inline error', async (status, message) => {
    load();
    const deletion = await confirm();
    if (status === 0) deletion.error(new ProgressEvent('error'));
    else deletion.flush({ detail: 'PRIVATE' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(page.state().status).toBe('loaded');
    expect(page.deleting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('PRIVATE');
    expect(link('Editar').getAttribute('href')).toBe('/books/42/edit');
    http.expectNone('/api/books/42');
  });
  it.each(['route', 'destroy'])('closes an open dialog on %s and does not delete', (action) => {
    load();
    page.openDeleteDialog();
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    const close = vi.spyOn(ref, 'close');
    if (action === 'destroy') fixture.destroy();
    else {
      params.next(convertToParamMap({ id: '43' }));
      http.expectOne('/api/books/43').flush(testBook({ id: 43 }));
    }
    expect(close).toHaveBeenCalledWith(false);
    http.expectNone('/api/books/42');
    expect(navigate).not.toHaveBeenCalled();
  });
  it.each(['route', 'destroy'])(
    'cancels DELETE and rejects stale responses on %s',
    async (action) => {
      load();
      const deletion = await confirm();
      if (action === 'destroy') fixture.destroy();
      else {
        params.next(convertToParamMap({ id: '43' }));
        http.expectOne('/api/books/43').flush(testBook({ id: 43, title: 'New book' }));
      }
      expect(deletion.cancelled).toBe(true);
      expect(() => deletion.flush(null)).toThrow();
      expect(navigate).not.toHaveBeenCalled();
      if (action === 'route') {
        fixture.detectChanges();
        expect(element.querySelector('h1')?.textContent).toBe('New book');
        expect(page.deleting()).toBe(false);
      }
    },
  );
});
