import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../../app.routes';
import { completeMembershipQueries } from '../../../reading-list/reading-list-membership.testing';
import { testBookPage } from '../../models/book.testing';
import { testPhotoCapabilities } from '../../models/book-photo-import.testing';
import { BookImport } from '../book-import/book-import';
import { BooksCatalog } from '../books-catalog/books-catalog';
import { BookPhotoImport } from './book-photo-import';

describe('Photo import routing', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lazy-loads a static photo route before book detail without changing ISBN import', () => {
    const photo = routes.find((route) => route.path === 'books/photo-import')!;
    expect(photo.component).toBeUndefined();
    expect(photo.loadComponent).toBeTypeOf('function');
    expect(routes.indexOf(photo)).toBeLessThan(
      routes.findIndex((route) => route.path === 'books/:id'),
    );
    expect(routes.find((route) => route.path === 'books/import')?.loadComponent).toBeTypeOf(
      'function',
    );
  });

  it('opens directly with no HTTP and returns only supported catalog context', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/books/photo-import?genre=%20Terror%20&ratingMin=99&photo=private&isbn=bad',
      BookPhotoImport,
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/book-photo-import/capabilities')
      .flush(testPhotoCapabilities());
    expect(page.photos()).toEqual([]);
    expect(page.catalogParams).toEqual({ genre: ['Terror'] });
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toBe(
      'Importar libros desde fotografías',
    );
    TestBed.inject(HttpTestingController).expectNone(() => true);
    harness.fixture.destroy();
  });

  it('preserves catalog context through its separate visible link and back navigation', async () => {
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/books?page=2&size=50&sortBy=author&direction=DESC&title=Dune&readingStatus=READ',
      BooksCatalog,
    );
    http
      .expectOne((req) => req.url === '/api/books/search')
      .flush(testBookPage({ page: 2, size: 50 }));
    completeMembershipQueries(http);
    harness.detectChanges();
    const context = router.parseUrl(router.url).queryParams;
    const links = Array.from(harness.routeNativeElement!.querySelectorAll('a'));
    const photoLink = links.find(
      (link) => link.textContent?.trim() === 'Importar desde fotografías',
    )!;
    const isbnLink = links.find((link) => link.textContent?.trim() === 'Importar ISBN')!;
    expect(photoLink.closest('form')).toBeNull();
    expect(isbnLink.getAttribute('href')).toContain('/books/import?');
    photoLink.click();
    await harness.fixture.whenStable();
    http.expectOne('/api/book-photo-import/capabilities').flush(testPhotoCapabilities());
    harness.detectChanges();
    expect(router.url.startsWith('/books/photo-import?')).toBe(true);
    expect(router.parseUrl(router.url).queryParams).toEqual(context);
    http.expectNone(() => true);
    Array.from(harness.routeNativeElement!.querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Volver al catálogo')!
      .click();
    await harness.fixture.whenStable();
    expect(router.parseUrl(router.url).queryParams).toEqual(context);
    const request = http.expectOne((req) => req.url === '/api/books/search');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.getAll('readingStatus')).toEqual(['READ']);
    request.flush(testBookPage({ page: 2, size: 50 }));
    completeMembershipQueries(http);
    harness.fixture.destroy();
  });

  it('still loads the independent ISBN import page without HTTP', async () => {
    const harness = await RouterTestingHarness.create();
    const isbnPage = await harness.navigateByUrl('/books/import', BookImport);
    expect(isbnPage.rows()).toEqual([]);
    expect(harness.routeNativeElement!.textContent).toContain('Importar ISBN');
    TestBed.inject(HttpTestingController).expectNone(() => true);
    harness.fixture.destroy();
  });
});
