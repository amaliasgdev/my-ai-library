import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BooksCatalog } from './features/books/pages/books-catalog/books-catalog';
import { BookCreate } from './features/books/pages/book-create/book-create';
import { testBook, testBookPage } from './features/books/models/book.testing';
import { BookEdit } from './features/books/pages/book-edit/book-edit';
import { BookDetail } from './features/books/pages/book-detail/book-detail';
import { MatDialog, MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';

describe('Application routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
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
    create.editor().form.patchValue({ title: 'Nuevo libro', author: 'Autora' });
    create.editor().submit();
    http
      .expectOne('/api/books')
      .flush({ id: 2, title: 'Nuevo libro' }, { status: 201, statusText: 'Created' });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books');
    const reload = http.expectOne((req) => req.url === '/api/books');
    expect(reload.request.method).toBe('GET');
    reload.flush(testBookPage());
  });

  it('should lazy-load the edit route and request the route id', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/books/42/edit', BookEdit);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/books/42')
      .flush(testBook({ id: 42 }));
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Editar libro');
    expect(TestBed.inject(Title).getTitle()).toBe('Editar libro | Mi Biblioteca');
  });

  it('should lazy-load detail through the card link and navigate to edit and catalog', async () => {
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    await harness.navigateByUrl('/books', BooksCatalog);
    http.expectOne((req) => req.url === '/api/books').flush(testBookPage());
    await harness.fixture.whenStable();
    (
      harness.routeNativeElement?.querySelector(
        'app-book-card a[aria-label^="Ver detalle de "]',
      ) as HTMLAnchorElement
    ).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books/1');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(BookDetail);
    http.expectOne('/api/books/1').flush(testBook());
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Libro de prueba');
    const anchors = () => Array.from(harness.routeNativeElement!.querySelectorAll('a'));
    anchors()
      .find((a) => a.textContent?.trim() === 'Editar')!
      .click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books/1/edit');
    http.expectOne('/api/books/1').flush(testBook());
    await harness.navigateByUrl('/books/1', BookDetail);
    http.expectOne('/api/books/1').flush(testBook());
    await harness.fixture.whenStable();
    anchors()
      .find((a) => a.textContent?.trim() === 'Volver al catálogo')!
      .click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books');
    http.expectOne((req) => req.url === '/api/books').flush(testBookPage());
  });

  it('should keep static new and edit routes before detail', () => {
    expect(
      routes.filter((route) => route.path?.startsWith('books')).map((route) => route.path),
    ).toEqual(['books/import', 'books/new', 'books/:id/edit', 'books/:id', 'books']);
  });

  it('should preserve catalog context through detail, edit cancellation and successful PUT', async () => {
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const context = { page: '2', size: '50', sortBy: 'author', direction: 'DESC', title: 'Dune' };
    const url = '/books?page=2&size=50&sortBy=author&direction=DESC&title=Dune';
    await harness.navigateByUrl(url, BooksCatalog);
    http
      .expectOne((req) => req.url === '/api/books/search')
      .flush(testBookPage({ page: 2, size: 50 }));
    await harness.fixture.whenStable();
    const click = (text: string) =>
      Array.from(harness.routeNativeElement!.querySelectorAll('a'))
        .find((a) => a.textContent?.trim() === text)!
        .click();
    click('Ver detalle');
    await harness.fixture.whenStable();
    expect(router.parseUrl(router.url).queryParams).toEqual(context);
    const get = http.expectOne('/api/books/1');
    expect(get.request.params.keys()).toEqual([]);
    get.flush(testBook());
    await harness.fixture.whenStable();
    click('Editar');
    await harness.fixture.whenStable();
    expect(router.parseUrl(router.url).queryParams).toEqual(context);
    http.expectOne('/api/books/1').flush(testBook());
    await harness.fixture.whenStable();
    (harness.routeDebugElement!.componentInstance as BookEdit).cancel();
    await harness.fixture.whenStable();
    expect(router.url).toBe(url);
    const list = http.expectOne((req) => req.url === '/api/books/search');
    expect(list.request.params.get('page')).toBe('2');
    list.flush(testBookPage({ page: 2, size: 50 }));
    await harness.fixture.whenStable();
    click('Editar');
    await harness.fixture.whenStable();
    http.expectOne('/api/books/1').flush(testBook());
    await harness.fixture.whenStable();
    const edit = harness.routeDebugElement!.componentInstance as BookEdit;
    edit.editor()!.form.controls.title.setValue('Edited');
    edit.editor()!.submit();
    const put = http.expectOne('/api/books/1');
    expect(put.request.params.keys()).toEqual([]);
    put.flush(testBook({ title: 'Edited' }));
    await harness.fixture.whenStable();
    expect(router.url).toBe(url);
    http
      .expectOne((req) => req.url === '/api/books/search')
      .flush(testBookPage({ page: 2, size: 50 }));
  });

  it('should return and delete from detail with context, without adding context to book HTTP', async () => {
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const detail = await harness.navigateByUrl(
      '/books/42?page=3&sortBy=rating&direction=DESC',
      BookDetail,
    );
    http.expectOne('/api/books/42').flush(testBook({ id: 42 }));
    await harness.fixture.whenStable();
    const back = Array.from(harness.routeNativeElement!.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'Volver al catálogo',
    )!;
    expect(back.getAttribute('href')).toBe('/books?page=3&sortBy=rating&direction=DESC');
    detail.openDeleteDialog();
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(detail.deleting()).toBe(true));
    const deletion = http.expectOne('/api/books/42');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.params.keys()).toEqual([]);
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    await harness.fixture.whenStable();
    expect(router.url).toBe('/books?page=3&sortBy=rating&direction=DESC');
    const get = http.expectOne((req) => req.url === '/api/books');
    expect(get.request.params.get('page')).toBe('3');
    get.flush(testBookPage({ page: 3, content: [] }));
    http.expectNone('/api/books/42');
  });

  it('should navigate from the card edit link and reload the catalog after saving changes', async () => {
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    await harness.navigateByUrl('/books', BooksCatalog);
    http.expectOne((req) => req.url === '/api/books').flush(testBookPage());
    await harness.fixture.whenStable();
    (
      harness.routeNativeElement?.querySelector(
        'app-book-card a[aria-label^="Editar "]',
      ) as HTMLAnchorElement
    ).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books/1/edit');
    http.expectOne('/api/books/1').flush(testBook());
    await harness.fixture.whenStable();
    const edit = harness.routeDebugElement?.componentInstance as BookEdit;
    edit.editor()!.form.controls.title.setValue('Edited title');
    edit.editor()!.submit();
    const put = http.expectOne('/api/books/1');
    expect(put.request.method).toBe('PUT');
    put.flush(testBook({ title: 'Edited title' }));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/books');
    http.expectOne((req) => req.url === '/api/books').flush(testBookPage());
  });
});
