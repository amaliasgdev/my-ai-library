import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../../app.routes';
import { testBookPage } from '../../models/book.testing';
import { BooksCatalog } from '../books-catalog/books-catalog';
import { BookImport } from './book-import';

describe('ISBN import routing and catalog context', () => {
  it('declares static import before dynamic book routes', () => {
    expect(routes.findIndex((route) => route.path === 'books/import')).toBeLessThan(
      routes.findIndex((route) => route.path === 'books/:id'),
    );
  });
  it('catalog action is outside forms, preserves context and returning reloads the same query', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const harness = await RouterTestingHarness.create();
    const url =
      '/books?page=2&size=50&sortBy=author&direction=DESC&title=Dune&readingStatus=READING&readingStatus=READ&ratingMin=4&genre=Terror';
    await harness.navigateByUrl(url, BooksCatalog);
    http
      .expectOne((req) => req.url === '/api/books/search')
      .flush(testBookPage({ page: 2, size: 50 }));
    harness.detectChanges();
    const context = router.parseUrl(router.url).queryParams;
    const link = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('a'),
    ).find((item) => item.textContent?.trim() === 'Importar ISBN')!;
    expect(link.closest('form')).toBeNull();
    link.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(router.url.startsWith('/books/import?')).toBe(true);
    expect(router.parseUrl(router.url).queryParams).toEqual(context);
    http.expectNone(() => true);
    const back = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('a'),
    ).find((item) => item.textContent?.trim() === 'Volver al catálogo')!;
    back.click();
    await harness.fixture.whenStable();
    expect(router.parseUrl(router.url).queryParams).toEqual(context);
    const request = http.expectOne((req) => req.url === '/api/books/search');
    expect(request.request.params.getAll('readingStatus')).toEqual(['READING', 'READ']);
    expect(request.request.params.get('page')).toBe('2');
    request.flush(testBookPage({ page: 2, size: 50 }));
    http.verify();
    harness.fixture.destroy();
  });
  it('direct/reloaded import starts empty and only normalized supported catalog context is returned', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/books/import?genre=%20Terror%20&ratingMin=99&internalBatch=secret',
      BookImport,
    );
    expect(page.text.value).toBe('');
    expect(page.rows()).toEqual([]);
    expect(page.catalogParams).toEqual({ genre: 'Terror' });
    http.expectNone(() => true);
    harness.fixture.destroy();
    http.verify();
  });
});
