import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatPaginator } from '@angular/material/paginator';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BookSearchRequest } from '../../models/book.models';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';
import {
  provideCatalogRoutingTesting,
  setCatalogPageTesting,
} from './books-catalog-routing.testing';

describe('BooksCatalog search', () => {
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
        provideCatalogRoutingTesting(),
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
    listRequest().flush(testBookPage());
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function listRequest() {
    return http.expectOne((req) => req.url === '/api/books');
  }
  function searchRequest() {
    return http.expectOne((req) => req.url === '/api/books/search');
  }
  function paginator(): MatPaginator {
    return fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
  }
  function setInput(field: 'title' | 'author' | 'isbn', value: string) {
    const input = element.querySelector<HTMLInputElement>(`[formControlName="${field}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function submit(criteria?: BookSearchRequest) {
    if (criteria) fixture.componentInstance.searchForm.patchValue(criteria);
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }
  function clear() {
    const button = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Limpiar búsqueda',
    )!;
    button.click();
    fixture.detectChanges();
  }
  async function confirmDelete() {
    (element.querySelector('app-book-card mat-card-actions button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ selector: '.confirm-delete' }))).click();
    await vi.waitFor(() => expect(fixture.componentInstance.deletingId()).not.toBeNull());
    await fixture.whenStable();
    return http.expectOne('/api/books/1');
  }

  it('should start with an empty typed form, labels and native submit semantics', () => {
    expect(fixture.componentInstance.searchForm.getRawValue()).toEqual({
      title: '',
      author: '',
      isbn: '',
    });
    expect(fixture.componentInstance.currentSearch()).toBeNull();
    expect(element.querySelector('form')?.getAttribute('aria-labelledby')).toBe('search-heading');
    expect(element.querySelectorAll('form mat-label')).toHaveLength(3);
    expect(element.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Buscar');
    expect(
      Array.from(element.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Limpiar búsqueda',
      )?.type,
    ).toBe('button');
  });

  it.each([
    {},
    { title: ' ', author: ' ', isbn: ' ' },
    { title: 'Dune', isbn: '9780306406157' },
    { author: 'Herbert', isbn: '9780306406157' },
    { title: 'a'.repeat(256) },
    { author: 'a'.repeat(256) },
    { isbn: 'bad' },
    { isbn: '1'.repeat(21) },
  ])('should prevent HTTP, preserve values and touch invalid criteria %j', (criteria) => {
    submit(criteria);
    http.expectNone((req) => req.url === '/api/books/search');
    expect(fixture.componentInstance.searchForm.touched).toBe(true);
    expect(fixture.componentInstance.currentSearch()).toBeNull();
    expect(element.querySelectorAll('app-book-card')).toHaveLength(1);
    expect(document.activeElement?.tagName).toBe('INPUT');
    for (const [key, value] of Object.entries(criteria)) {
      expect(fixture.componentInstance.searchForm.get(key)?.value).toBe(value);
    }
  });

  it.each([
    { title: 'Dune' },
    { author: 'Herbert' },
    { title: 'Dune', author: 'Herbert' },
    { isbn: '978-0-306-40615-8' },
  ])('should search %j on submit without checksum checks', (criteria) => {
    submit(criteria);
    const request = searchRequest();
    expect(fixture.componentInstance.currentSearch()).toEqual(criteria);
    for (const [key, value] of Object.entries(criteria))
      expect(request.request.params.get(key)).toBe(value);
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('title');
    expect(request.request.params.get('direction')).toBe('ASC');
    expect(element.querySelector('mat-spinner')).not.toBeNull();
    expect(element.querySelectorAll('app-book-card')).toHaveLength(0);
    request.flush(testBookPage({ content: [testBook({ title: 'Search result' })] }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Search result');
  });

  it('should run the form submit path used by Enter and omit blank params', () => {
    setInput('title', '  Dune  ');
    setInput('author', ' ');
    // jsdom does not implement implicit Enter submission; requestSubmit invokes the native submit path.
    element.querySelector('form')!.requestSubmit();
    fixture.detectChanges();
    const request = searchRequest();
    expect(request.request.params.get('title')).toBe('Dune');
    expect(request.request.params.has('author')).toBe(false);
    expect(request.request.params.has('isbn')).toBe(false);
    request.flush(testBookPage());
  });

  it('should show an accessible exclusivity error without disabling or clearing inputs', () => {
    submit({ title: 'Dune', isbn: '9780306406157' });
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'El ISBN no se puede combinar con título o autor',
    );
    expect(document.activeElement).toBe(element.querySelector('[formControlName="isbn"]'));
    expect(
      Array.from(element.querySelectorAll<HTMLInputElement>('input')).every(
        (input) => !input.disabled,
      ),
    ).toBe(true);
    setInput('isbn', '');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    submit();
    searchRequest().flush(testBookPage());
  });

  it('should not load anything on keystrokes and preserve the applied snapshot for pagination', () => {
    submit({ title: 'Dune' });
    searchRequest().flush(testBookPage({ totalElements: 41, totalPages: 3 }));
    fixture.detectChanges();
    setInput('title', 'Changed');
    http.expectNone((req) => req.method === 'GET');
    expect(fixture.componentInstance.currentSearch()).toEqual({ title: 'Dune' });
    fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 20, length: 41 });
    const next = searchRequest();
    expect(next.request.params.get('title')).toBe('Dune');
    expect(next.request.params.get('page')).toBe('1');
    next.flush(testBookPage({ page: 1, totalElements: 41, totalPages: 3 }));
  });

  it('should keep the snapshot and reset to page 0 when changing search page size', () => {
    submit({ author: 'Herbert' });
    searchRequest().flush(testBookPage({ page: 1, totalElements: 41, totalPages: 3 }));
    fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 50, length: 41 });
    const request = searchRequest();
    expect(request.request.params.get('author')).toBe('Herbert');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('50');
    request.flush(testBookPage({ size: 50 }));
  });

  it('should return a new search to page 0 and retain the current size', () => {
    fixture.componentInstance.onPageChange({ pageIndex: 0, pageSize: 50, length: 1 });
    listRequest().flush(testBookPage({ page: 2, size: 50 }));
    submit({ title: 'Dune' });
    const request = searchRequest();
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('50');
    request.flush(testBookPage({ size: 50 }));
  });

  it('should cancel previous search GET and display only the newest results', () => {
    submit({ title: 'Old' });
    const old = searchRequest();
    submit({ title: 'New' });
    expect(old.cancelled).toBe(true);
    searchRequest().flush(testBookPage({ content: [testBook({ title: 'New result' })] }));
    fixture.detectChanges();
    expect(element.textContent).toContain('New result');
    expect(fixture.componentInstance.currentSearch()).toEqual({ title: 'New' });
  });

  it('should cancel an active list GET when searching and a search GET when clearing', () => {
    fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 20, length: 41 });
    const listing = listRequest();
    submit({ title: 'Dune' });
    expect(listing.cancelled).toBe(true);
    const searching = searchRequest();
    clear();
    expect(searching.cancelled).toBe(true);
    listRequest().flush(testBookPage());
    expect(fixture.componentInstance.currentSearch()).toBeNull();
  });

  it('should distinguish no search results from an empty library', () => {
    submit({ title: 'Missing' });
    searchRequest().flush(testBookPage({ content: [], totalElements: 0, totalPages: 0 }));
    fixture.detectChanges();
    expect(element.textContent).toContain('No se encontraron libros');
    expect(element.textContent).not.toContain('Tu biblioteca todavía no tiene libros');
    clear();
    listRequest().flush(testBookPage({ content: [], totalElements: 0, totalPages: 0 }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Tu biblioteca todavía no tiene libros');
  });

  it('should keep search when returning from an out-of-range page to page 0', () => {
    submit({ title: 'Dune' });
    setCatalogPageTesting(2);
    searchRequest().flush(testBookPage({ page: 2, content: [], totalElements: 1, totalPages: 1 }));
    fixture.detectChanges();
    expect(element.textContent).toContain('No hay libros en esta página');
    const first = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Volver a la primera'),
    )!;
    first.click();
    const request = searchRequest();
    expect(request.request.params.get('title')).toBe('Dune');
    expect(request.request.params.get('page')).toBe('0');
    request.flush(testBookPage());
  });

  it.each([
    [0, 'No se puede conectar con el servidor'],
    [400, 'No se pudo realizar la búsqueda con estos criterios'],
    [500, 'El servidor no pudo realizar la búsqueda'],
    [404, 'No se pudo realizar la búsqueda'],
  ])('should report a safe search error %s and retry the exact snapshot', (status, message) => {
    submit({ title: 'Dune' });
    const failed = searchRequest();
    if (status === 0) failed.error(new ProgressEvent('error'));
    else failed.flush({ detail: 'SECRET' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('SECRET');
    expect(fixture.componentInstance.searchForm.controls.title.value).toBe('Dune');
    setInput('title', 'Not submitted');
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reintentar')!
      .click();
    const retry = searchRequest();
    expect(retry.request.params.toString()).toBe(failed.request.params.toString());
    retry.flush(testBookPage());
  });

  it('should clear all inputs, retain page size and use normal pagination afterwards', () => {
    fixture.componentInstance.onPageChange({ pageIndex: 0, pageSize: 50, length: 1 });
    listRequest().flush(testBookPage({ size: 50 }));
    submit({ title: 'Dune', author: 'Herbert' });
    searchRequest().flush(testBookPage({ page: 1, size: 50 }));
    fixture.detectChanges();
    clear();
    expect(fixture.componentInstance.searchForm.getRawValue()).toEqual({
      title: '',
      author: '',
      isbn: '',
    });
    expect(fixture.componentInstance.searchForm.pristine).toBe(true);
    expect(fixture.componentInstance.currentSearch()).toBeNull();
    const request = listRequest();
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('50');
    request.flush(testBookPage({ size: 50, totalElements: 51, totalPages: 2 }));
    fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 50, length: 51 });
    listRequest().flush(testBookPage({ page: 1, size: 50 }));
  });

  it('should reload the applied search after DELETE and guard search/clear while deleting', async () => {
    submit({ title: 'Dune' });
    searchRequest().flush(
      testBookPage({ content: [testBook(), testBook({ id: 2 })], totalElements: 2 }),
    );
    fixture.detectChanges();
    const deletion = await confirmDelete();
    setInput('title', 'Not submitted');
    const searchButton = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const clearButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Limpiar búsqueda',
    )!;
    expect(searchButton.disabled).toBe(true);
    expect(clearButton.disabled).toBe(true);
    expect(paginator().disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[formControlName="title"]')?.disabled).toBe(
      false,
    );
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/books/new');
    fixture.componentInstance.submitSearch();
    fixture.componentInstance.clearSearch();
    http.expectNone((req) => req.method === 'GET');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    const reload = searchRequest();
    expect(reload.request.params.get('title')).toBe('Dune');
    expect(reload.request.params.get('page')).toBe('0');
    reload.flush(testBookPage({ content: [testBook({ id: 2 })] }));
    await fixture.whenStable();
    expect(fixture.componentInstance.currentSearch()).toEqual({ title: 'Dune' });
    expect(searchButton.disabled).toBe(false);
    expect(clearButton.disabled).toBe(false);
  });

  it('should reload search then page - 1 with the same criteria after deleting its last page result', async () => {
    submit({ author: 'Herbert' });
    setCatalogPageTesting(2);
    searchRequest().flush(testBookPage({ page: 2, totalElements: 41, totalPages: 3 }));
    fixture.detectChanges();
    const deletion = await confirmDelete();
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    const reload = searchRequest();
    expect(reload.request.params.get('page')).toBe('2');
    reload.flush(testBookPage({ content: [], page: 2, totalElements: 40, totalPages: 2 }));
    const previous = searchRequest();
    expect(previous.request.params.get('page')).toBe('1');
    expect(previous.request.params.get('author')).toBe('Herbert');
    previous.flush(testBookPage({ page: 1, totalElements: 40, totalPages: 2 }));
    await fixture.whenStable();
    expect(paginator().pageIndex).toBe(1);
    expect(paginator().length).toBe(40);
    expect(fixture.componentInstance.currentSearch()).toEqual({ author: 'Herbert' });
    http.expectNone((req) => req.url === '/api/books');
  });

  it('should separate a successful DELETE from a failed search reload', async () => {
    submit({ title: 'Dune' });
    searchRequest().flush(testBookPage());
    fixture.detectChanges();
    const deletion = await confirmDelete();
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    searchRequest().flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'El servidor no pudo realizar la búsqueda',
    );
    expect(fixture.componentInstance.deleteError()).toBeNull();
    http.expectNone((req) => req.method === 'DELETE');
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
  });

  it('should retry the exact previous-page GET if the fallback after DELETE fails', async () => {
    submit({ title: 'Dune' });
    setCatalogPageTesting(2);
    searchRequest().flush(testBookPage({ page: 2, totalElements: 41, totalPages: 3 }));
    fixture.detectChanges();
    const deletion = await confirmDelete();
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    searchRequest().flush(testBookPage({ content: [], page: 2, totalElements: 40, totalPages: 2 }));
    const failed = searchRequest();
    expect(failed.request.params.get('page')).toBe('1');
    failed.error(new ProgressEvent('error'));
    await fixture.whenStable();
    setInput('title', 'Not submitted');
    element.querySelector<HTMLButtonElement>('.catalog-content button')!.click();
    const retry = searchRequest();
    expect(retry.request.params.toString()).toBe(failed.request.params.toString());
    retry.flush(testBookPage({ page: 1, totalElements: 40, totalPages: 2 }));
    await fixture.whenStable();
    expect(paginator().pageIndex).toBe(1);
  });

  it('should retain applied search results and criteria when DELETE fails', async () => {
    submit({ isbn: '9780306406157' });
    searchRequest().flush(testBookPage());
    fixture.detectChanges();
    const deletion = await confirmDelete();
    deletion.flush({}, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe('El libro ya no existe');
    expect(element.querySelectorAll('app-book-card')).toHaveLength(1);
    expect(fixture.componentInstance.currentSearch()).toEqual({ isbn: '9780306406157' });
    expect(paginator().disabled).toBe(false);
    http.expectNone((req) => req.method === 'GET');
  });
});
