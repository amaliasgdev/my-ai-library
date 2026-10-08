import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BooksCatalog } from './features/books/pages/books-catalog/books-catalog';
import { BookCreate } from './features/books/pages/book-create/book-create';
import { testBookPage } from './features/books/models/book.testing';

describe('Application routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http.verify();
  });

  it('should redirect / to /books', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', BooksCatalog);
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url === '/api/books')
      .flush(testBookPage());
    expect(TestBed.inject(Router).url).toBe('/books');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Mi Biblioteca');
  });

  it('should load the standalone catalog directly and set the document title', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/books', BooksCatalog);
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url === '/api/books')
      .flush(testBookPage());
    expect(page).toBeInstanceOf(BooksCatalog);
    expect(TestBed.inject(Title).getTitle()).toBe('Mi Biblioteca');
  });

  it('should lazy-load /books/new without querying the catalog', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/books/new', BookCreate);
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Añadir libro');
    expect(TestBed.inject(Title).getTitle()).toBe('Añadir libro | Mi Biblioteca');
    TestBed.inject(HttpTestingController).expectNone((req) => req.url === '/api/books');
  });

  it('should navigate from the catalog add link and reload the catalog after creating a book', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/books', BooksCatalog);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((req) => req.url === '/api/books').flush(testBookPage());
    (harness.routeNativeElement?.querySelector('a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books/new');
    const create = harness.routeDebugElement?.componentInstance as BookCreate;
    create.form.patchValue({ title: 'Nuevo libro', author: 'Autora' });
    create.submit();
    http
      .expectOne('/api/books')
      .flush({ id: 2, title: 'Nuevo libro' }, { status: 201, statusText: 'Created' });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books');
    const reload = http.expectOne((req) => req.url === '/api/books');
    expect(reload.request.method).toBe('GET');
    reload.flush(testBookPage());
  });
});
