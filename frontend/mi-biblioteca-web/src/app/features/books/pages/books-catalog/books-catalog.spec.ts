import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatPaginator } from '@angular/material/paginator';
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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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
