import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatPaginator } from '@angular/material/paginator';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { BookDeleteDialog } from '../../components/book-delete-dialog/book-delete-dialog';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';

describe('BooksCatalog', () => {
  let fixture: ComponentFixture<BooksCatalog>;
  let element: HTMLElement;
  let http: HttpTestingController;

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
  });

  afterEach(() => http.verify());

  function pendingRequest() {
    return http.expectOne((request) => request.url === '/api/books');
  }

  function paginator(): MatPaginator {
    return fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
  }

  async function deleteFirstBook() {
    (element.querySelector('app-book-card button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (
      await loader.getHarness(
        MatButtonHarness.with({ text: 'Eliminar', selector: '.confirm-delete' }),
      )
    ).click();
    await vi.waitFor(() => expect(fixture.componentInstance.deletingId()).not.toBeNull());
    await fixture.whenStable();
  }

  it('should open one confirmation, not DELETE on first click or cancellation', async () => {
    pendingRequest().flush(testBookPage());
    fixture.detectChanges();
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open');
    const book = testBook();
    fixture.componentInstance.openDeleteDialog(book);
    fixture.componentInstance.openDeleteDialog(book);
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0]).toBe(BookDeleteDialog);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Cancelar' }))).click();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    await fixture.whenStable();
    http.expectNone((req) => req.method === 'DELETE');
    expect(element.querySelectorAll('app-book-card')).toHaveLength(1);
  });

  it.each(['escape', 'backdrop'])(
    'should not DELETE after dialog dismissal by %s',
    async (method) => {
      pendingRequest().flush(testBookPage());
      fixture.detectChanges();
      fixture.componentInstance.openDeleteDialog(testBook());
      await fixture.whenStable();
      const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
      if (method === 'escape') await (await loader.getHarness(MatDialogHarness)).close();
      else (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
      await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
      await fixture.whenStable();
      http.expectNone((req) => req.method === 'DELETE');
    },
  );

  it('should confirm the correct id, block double deletes and the paginator but keep Añadir libro available', async () => {
    pendingRequest().flush(
      testBookPage({
        content: [testBook({ id: 42 }), testBook({ id: 43 })],
        totalElements: 42,
        totalPages: 3,
      }),
    );
    fixture.detectChanges();
    await deleteFirstBook();
    const deletion = http.expectOne('/api/books/42');
    expect(deletion.request.method).toBe('DELETE');
    expect(fixture.componentInstance.deletingId()).toBe(42);
    expect(paginator().disabled).toBe(true);
    expect(
      Array.from(element.querySelectorAll('app-book-card button')).every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);
    expect(element.querySelector('app-book-card a')?.getAttribute('href')).toBeNull();
    expect(element.querySelectorAll('app-book-card a')[1].getAttribute('href')).toBe(
      '/books/43/edit',
    );
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/books/new');
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open');
    fixture.componentInstance.openDeleteDialog(testBook({ id: 43 }));
    fixture.componentInstance.openDeleteDialog(testBook({ id: 42 }));
    expect(open).not.toHaveBeenCalled();
    fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 50, length: 42 });
    http.expectNone((req) => req.method === 'GET');
    expect(element.querySelectorAll('app-book-card')).toHaveLength(2);
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    const reload = pendingRequest();
    expect(reload.request.params.get('page')).toBe('0');
    expect(reload.request.params.get('size')).toBe('20');
    reload.flush(
      testBookPage({ content: [testBook({ id: 43 })], totalElements: 41, totalPages: 3 }),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.deletingId()).toBeNull();
    expect(paginator().length).toBe(41);
    expect(element.querySelectorAll('app-book-card')).toHaveLength(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('should stay on the current page when deleting one of several books', async () => {
    pendingRequest().flush(
      testBookPage({
        content: [testBook({ id: 41 }), testBook({ id: 42 })],
        page: 2,
        totalElements: 42,
        totalPages: 3,
      }),
    );
    fixture.detectChanges();
    await deleteFirstBook();
    http.expectOne('/api/books/41').flush(null, { status: 204, statusText: 'No Content' });
    const reload = pendingRequest();
    expect(reload.request.params.get('page')).toBe('2');
    reload.flush(
      testBookPage({ content: [testBook({ id: 42 })], page: 2, totalElements: 41, totalPages: 3 }),
    );
    await fixture.whenStable();
    expect(paginator().pageIndex).toBe(2);
    http.expectNone((req) => req.method === 'GET');
  });

  it('should show an empty library after deleting the last book on page 0', async () => {
    pendingRequest().flush(testBookPage());
    fixture.detectChanges();
    await deleteFirstBook();
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    const reload = pendingRequest();
    expect(reload.request.params.get('page')).toBe('0');
    reload.flush(testBookPage({ content: [], totalElements: 0, totalPages: 0 }));
    await fixture.whenStable();
    expect(element.textContent).toContain('Tu biblioteca todavía no tiene libros');
    expect(paginator().length).toBe(0);
    expect(paginator().pageIndex).toBe(0);
    expect(document.activeElement).toBe(element.querySelector('h1'));
    http.expectNone((req) => req.method === 'GET');
  });

  it('should reload the current page then request exactly page - 1 when empty', async () => {
    pendingRequest().flush(testBookPage({ page: 2, totalElements: 41, totalPages: 3 }));
    fixture.detectChanges();
    await deleteFirstBook();
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    const reload = pendingRequest();
    expect(reload.request.params.get('page')).toBe('2');
    reload.flush(testBookPage({ content: [], page: 2, totalElements: 40, totalPages: 2 }));
    const previous = pendingRequest();
    expect(previous.request.params.get('page')).toBe('1');
    previous.flush(testBookPage({ page: 1, totalElements: 40, totalPages: 2 }));
    await fixture.whenStable();
    expect(paginator().pageIndex).toBe(1);
    expect(paginator().length).toBe(40);
    http.expectNone((req) => req.method === 'GET');
  });

  it('should go back only one page, without computing the last valid page or looping', async () => {
    pendingRequest().flush(testBookPage({ page: 3, totalElements: 61, totalPages: 4 }));
    fixture.detectChanges();
    await deleteFirstBook();
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    pendingRequest().flush(
      testBookPage({ content: [], page: 3, totalElements: 10, totalPages: 1 }),
    );
    const previous = pendingRequest();
    expect(previous.request.params.get('page')).toBe('2');
    previous.flush(testBookPage({ content: [], page: 2, totalElements: 10, totalPages: 1 }));
    await fixture.whenStable();
    expect(paginator().pageIndex).toBe(2);
    http.expectNone((req) => req.method === 'GET');
  });

  it.each([
    [404, 'El libro ya no existe'],
    [500, 'El servidor no pudo eliminar el libro'],
    [503, 'El servidor no pudo eliminar el libro'],
    [400, 'No se pudo eliminar el libro'],
  ])(
    'should preserve cards and pagination with a safe inline DELETE error for %s',
    async (status, message) => {
      pendingRequest().flush(testBookPage({ page: 1, totalElements: 21, totalPages: 2 }));
      fixture.detectChanges();
      await deleteFirstBook();
      http
        .expectOne('/api/books/1')
        .flush({ detail: 'SECRET', title: 'SECRET' }, { status, statusText: 'Error' });
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
      expect(element.textContent).not.toContain('SECRET');
      expect(element.querySelectorAll('app-book-card')).toHaveLength(1);
      expect(paginator().pageIndex).toBe(1);
      expect(paginator().length).toBe(21);
      expect(paginator().disabled).toBe(false);
      expect(fixture.componentInstance.deletingId()).toBeNull();
      http.expectNone((req) => req.method === 'GET');
    },
  );

  it('should explain connection errors and require another confirmation for retry', async () => {
    pendingRequest().flush(testBookPage());
    fixture.detectChanges();
    await deleteFirstBook();
    http.expectOne('/api/books/1').error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(element.textContent).toContain('No se puede conectar con el servidor');
    http.expectNone((req) => req.method === 'DELETE');
    (element.querySelector('app-book-card button') as HTMLButtonElement).click();
    await fixture.whenStable();
    http.expectNone((req) => req.method === 'DELETE');
    TestBed.inject(MatDialog).closeAll();
    await fixture.whenStable();
  });

  it('should show a normal load error when DELETE succeeds but the following GET fails', async () => {
    pendingRequest().flush(testBookPage());
    fixture.detectChanges();
    await deleteFirstBook();
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    pendingRequest().flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'El servidor no pudo cargar el catálogo',
    );
    expect(fixture.componentInstance.deleteError()).toBeNull();
    expect(element.textContent).not.toContain('No se pudo eliminar');
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('should not steal focus from a stable control during the reload', async () => {
    pendingRequest().flush(testBookPage());
    fixture.detectChanges();
    await deleteFirstBook();
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    const add = element.querySelector('a') as HTMLAnchorElement;
    add.focus();
    pendingRequest().flush(testBookPage({ content: [], totalElements: 0, totalPages: 0 }));
    await fixture.whenStable();
    expect(document.activeElement).toBe(add);
  });

  it('should request the initial page with title ASC and show loading', () => {
    const request = pendingRequest();
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('title');
    expect(request.request.params.get('direction')).toBe('ASC');
    expect(element.textContent).toContain('Cargando libros');
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(element.querySelector('mat-spinner')).not.toBeNull();
    expect(paginator().disabled).toBe(true);
    request.flush(testBookPage());
  });

  it('should render results in server order with headings and synchronized pagination', async () => {
    pendingRequest().flush(
      testBookPage({
        content: [testBook({ id: 2, title: 'Zeta' }), testBook({ id: 1, title: 'Alfa' })],
        totalElements: 42,
        totalPages: 3,
      }),
    );
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe('Mi Biblioteca');
    expect(Array.from(element.querySelectorAll('h2'), (h) => h.textContent)).toEqual([
      'Zeta',
      'Alfa',
    ]);
    expect(element.querySelector('mat-spinner')).toBeNull();
    expect(element.querySelector('[aria-busy="false"]')).not.toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'Mostrando 2 de 42 libros',
    );
    expect(paginator().length).toBe(42);
    expect(paginator().pageIndex).toBe(0);
    expect(paginator().pageSize).toBe(20);
    expect(paginator().pageSizeOptions).toEqual([10, 20, 50, 100]);
    const harness = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    expect(await harness.getRangeLabel()).toBe('1–20 de 42');
    expect(element.textContent).toContain('Libros por página');
  });

  it('should remove the spinner automatically after a valid HTTP page reaches success', async () => {
    expect(element.querySelector('mat-spinner')).not.toBeNull();
    pendingRequest().flush(testBookPage());
    await fixture.whenStable();
    expect(element.querySelector('mat-spinner')).toBeNull();
    expect(element.querySelector('app-book-card')).not.toBeNull();
    expect(element.querySelector('[aria-busy="false"]')).not.toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'Mostrando 1 de 1 libros',
    );
    http.expectNone((request) => request.url === '/api/books');
  });

  it('should leave loading and show an inline error when HTTP 200 returns a legacy book array', async () => {
    expect(element.querySelector('mat-spinner')).not.toBeNull();
    pendingRequest().flush([testBook()]);
    await fixture.whenStable();
    expect(element.querySelector('mat-spinner')).toBeNull();
    expect(element.querySelector('app-book-card')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'No se pudo cargar el catálogo',
    );
    http.expectNone((request) => request.url === '/api/books');
  });

  it('should show an empty library', () => {
    pendingRequest().flush(testBookPage({ content: [], totalElements: 0, totalPages: 0 }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Tu biblioteca todavía no tiene libros');
    expect(element.querySelector('app-book-card')).toBeNull();
    expect(paginator().length).toBe(0);
    expect(element.querySelector('a')?.textContent).toContain('Añadir libro');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/books/new');
  });

  it('should show an empty out-of-range page with real totals and allow returning to page 0', () => {
    pendingRequest().flush(
      testBookPage({ content: [], page: 3, totalElements: 21, totalPages: 2 }),
    );
    fixture.detectChanges();
    expect(element.textContent).toContain('No hay libros en esta página');
    expect(element.textContent).not.toContain('Tu biblioteca todavía no tiene libros');
    expect(paginator().length).toBe(21);
    expect(paginator().pageIndex).toBe(3);
    const button = element.querySelector('.catalog-content button') as HTMLButtonElement;
    button.click();
    const request = pendingRequest();
    expect(request.request.params.get('page')).toBe('0');
    request.flush(testBookPage({ totalElements: 21, totalPages: 2 }));
  });

  it.each([
    [400, 'No se pudo cargar el catálogo con estos parámetros'],
    [500, 'El servidor no pudo cargar el catálogo'],
    [503, 'El servidor no pudo cargar el catálogo'],
    [404, 'No se pudo cargar el catálogo'],
  ])('should show a safe inline error for HTTP %s', (status, message) => {
    pendingRequest().flush({ detail: 'INTERNAL SECRET' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('INTERNAL SECRET');
    expect(element.querySelector('a')?.textContent).toContain('Añadir libro');
    expect(element.querySelector('app-book-card')).toBeNull();
    expect(element.querySelector('button')?.textContent).toContain('Reintentar');
  });

  it('should explain a connection failure with status 0', () => {
    pendingRequest().error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'No se puede conectar con el servidor',
    );
  });

  it('should retry only when requested and recover from an error', () => {
    pendingRequest().flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    http.expectNone((req) => req.url === '/api/books');
    (element.querySelector('button') as HTMLButtonElement).click();
    const request = pendingRequest();
    expect(request.request.params.get('page')).toBe('0');
    fixture.detectChanges();
    expect(element.querySelector('mat-spinner')).not.toBeNull();
    request.flush(testBookPage());
    fixture.detectChanges();
    expect(element.querySelector('app-book-card')).not.toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('should request the next backend page through MatPaginator and hide previous cards while loading', async () => {
    pendingRequest().flush(testBookPage({ totalElements: 42, totalPages: 3 }));
    fixture.detectChanges();
    const harness = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    await harness.goToNextPage();
    const request = pendingRequest();
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('20');
    expect(element.querySelector('app-book-card')).toBeNull();
    request.flush(testBookPage({ page: 1, totalElements: 42, totalPages: 3 }));
    fixture.detectChanges();
    expect(paginator().pageIndex).toBe(1);
  });

  it('should reset page to 0 when the page size changes', async () => {
    pendingRequest().flush(testBookPage({ page: 2, totalElements: 120, totalPages: 6 }));
    fixture.detectChanges();
    const harness = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    await harness.setPageSize(50);
    const request = pendingRequest();
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('50');
    request.flush(testBookPage({ size: 50, totalElements: 120, totalPages: 3 }));
    fixture.detectChanges();
    expect(paginator().pageIndex).toBe(0);
    expect(paginator().pageSize).toBe(50);
  });

  it('should cancel earlier requests and never render stale results', () => {
    const previous = pendingRequest();
    fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 20, length: 42 });
    expect(previous.cancelled).toBe(true);
    const current = pendingRequest();
    expect(current.request.params.get('page')).toBe('1');
    current.flush(
      testBookPage({ content: [testBook({ title: 'Latest result' })], page: 1, totalElements: 42 }),
    );
    fixture.detectChanges();
    expect(element.querySelector('h2')?.textContent).toBe('Latest result');
    expect(() => previous.flush(testBookPage())).toThrow();
  });

  it('should cancel pending HTTP when the page is destroyed', () => {
    const request = pendingRequest();
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
